import { NextResponse, NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import { SALESPERSONS } from '@/types/invoice';
import { getInvoice } from '@/lib/zoho';

async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let idx = 0;

    const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
        while (idx < items.length) {
            const current = idx++;
            results[current] = await fn(items[current]);
        }
    });

    await Promise.all(workers);
    return results;
}

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        const searchParams = request.nextUrl.searchParams;
        const startDateParam = searchParams.get('startDate');
        const endDateParam = searchParams.get('endDate');

        const query: { createdAt?: { $gte?: Date; $lte?: Date } } = {};
        if (startDateParam || endDateParam) {
            query.createdAt = {};
            if (startDateParam) {
                query.createdAt.$gte = new Date(startDateParam);
            }
            if (endDateParam) {
                const endDate = new Date(endDateParam);
                endDate.setHours(23, 59, 59, 999);
                query.createdAt.$lte = endDate;
            }
        }

        const orders = await Order.find(query).sort({ createdAt: -1 }).lean();

        // Build a map for each salesperson
        const revenueMap: Record<string, { totalRevenue: number; orders: typeof orders }> = {};

        // Initialize all known salespersons so they appear even with 0 orders
        for (const sp of SALESPERSONS) {
            revenueMap[sp] = { totalRevenue: 0, orders: [] };
        }

        const ordersWithTotals = await mapWithConcurrency(
            orders,
            5,
            async (order) => {
                const orderAny = order as Record<string, unknown>;
                const invoiceTotal = typeof orderAny.invoiceTotal === 'number' ? orderAny.invoiceTotal : null;
                if (invoiceTotal != null) return { order, total: invoiceTotal };

                const zohoInvoiceId = typeof orderAny.zohoInvoiceId === 'string' ? orderAny.zohoInvoiceId : '';
                if (zohoInvoiceId) {
                    try {
                        const inv = await getInvoice(zohoInvoiceId);
                        const zohoTotal = Number(inv.data?.invoice?.total);
                        if (inv.status === 200 && Number.isFinite(zohoTotal)) {
                            // Best-effort: persist for future calls (don't block response if it fails)
                            Order.updateOne({ zohoInvoiceId }, { $set: { invoiceTotal: zohoTotal } }).catch(() => null);
                            return { order, total: zohoTotal };
                        }
                    } catch {
                        // ignore Zoho fetch failures and fall back to line totals
                    }
                }

                // Final fallback: sum line item totals (does NOT include invoice-level discounts)
                const items = orderAny.invoiceItems as Array<{ item_total?: number; final_price?: number }> | undefined;
                let sum = 0;
                if (items && Array.isArray(items)) {
                    for (const item of items) {
                        sum += item.final_price || item.item_total || 0;
                    }
                }
                return { order, total: sum };
            }
        );

        for (const { order, total } of ordersWithTotals) {
            const name = (order as Record<string, unknown>).salespersonName as string;
            if (!name) continue;

            if (!revenueMap[name]) {
                revenueMap[name] = { totalRevenue: 0, orders: [] };
            }

            revenueMap[name].totalRevenue += total;
            revenueMap[name].orders.push(order);
        }

        // Convert to array sorted by revenue descending
        const result = Object.entries(revenueMap)
            .map(([salespersonName, data]) => ({
                salespersonName,
                totalRevenue: Math.round(data.totalRevenue * 100) / 100,
                orderCount: data.orders.length,
                orders: data.orders,
            }))
            .sort((a, b) => b.totalRevenue - a.totalRevenue);

        return NextResponse.json({ success: true, data: result }, { status: 200 });
    } catch (error: unknown) {
        console.error('Error fetching revenue data:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
