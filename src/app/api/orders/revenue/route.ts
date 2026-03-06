import { NextResponse, NextRequest } from 'next/server';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import { SALESPERSONS } from '@/types/invoice';

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        const searchParams = request.nextUrl.searchParams;
        const startDateParam = searchParams.get('startDate');
        const endDateParam = searchParams.get('endDate');

        let query: Record<string, any> = {};
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

        for (const order of orders) {
            const name = (order as Record<string, unknown>).salespersonName as string;
            if (!name) continue;

            if (!revenueMap[name]) {
                revenueMap[name] = { totalRevenue: 0, orders: [] };
            }

            // Sum item_total for each line item in this order
            const items = (order as Record<string, unknown>).invoiceItems as Array<{ item_total?: number }> | undefined;
            let orderTotal = 0;
            if (items && Array.isArray(items)) {
                for (const item of items) {
                    orderTotal += item.item_total || 0;
                }
            }

            revenueMap[name].totalRevenue += orderTotal;
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
