import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import { updateInvoice } from '@/lib/zoho';

/**
 * POST /api/orders/:id/resync-zoho
 *
 * Re-pushes the invoice line items stored in our DB to Zoho, using the
 * correct pre-tax rate derived from `final_price` + `tax_percentage`.
 *
 * This is used to correct orders whose Zoho invoice was corrupted by the
 * stale `item.price` bug (where the original Zoho rate was re-sent instead
 * of being recomputed from the user-entered final_price).
 *
 * After a successful push, clears the cached `invoiceTotal` on the order so
 * the revenue dashboard re-fetches the accurate total from Zoho.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await connectDB();
        const { id } = await params;

        const order = await Order.findOne({
            $or: [
                { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
                { zohoInvoiceId: id },
                { orderId: id },
            ],
        }).lean();

        if (!order) {
            return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
        }

        const orderAny = order as Record<string, unknown>;
        const zohoInvoiceId = typeof orderAny.zohoInvoiceId === 'string' ? orderAny.zohoInvoiceId : '';

        if (!zohoInvoiceId) {
            return NextResponse.json(
                { success: false, error: 'Order has no Zoho Invoice ID' },
                { status: 400 }
            );
        }

        const items = orderAny.invoiceItems as Array<Record<string, unknown>> | undefined;

        if (!items || items.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Order has no invoice items to sync' },
                { status: 400 }
            );
        }

        // Build Zoho line items — always derive rate from final_price to avoid stale values.
        const zohoLineItems = items.map((item) => {
            const finalPrice = typeof item.final_price === 'number' ? item.final_price : 0;
            const taxPct = typeof item.tax_percentage === 'number' ? item.tax_percentage : 0;
            const storedPrice = typeof item.price === 'number' ? item.price : 0;

            let pretaxRate: number = storedPrice;
            if (finalPrice > 0) {
                pretaxRate = taxPct > 0
                    ? finalPrice / (1 + taxPct / 100)
                    : finalPrice;
            }

            const line: Record<string, unknown> = {
                name: item.name,
                rate: Math.round(pretaxRate * 100) / 100,
                quantity: item.quantity,
            };

            if (item.hsn_or_sac) line.hsn_or_sac = item.hsn_or_sac;
            if (item.item_id) line.item_id = item.item_id;   // zoho catalog item_id
            if (item.description) line.description = item.description;
            if (item.tax_id && item.tax_id !== 'NO_TAX') line.tax_id = item.tax_id;
            if (typeof item.discount === 'number') line.discount = item.discount;
            if (item.unit) line.unit = item.unit;

            return line;
        });

        console.log(`[resync-zoho] Re-syncing ${zohoInvoiceId} with`, zohoLineItems.length, 'items');
        console.log('[resync-zoho] Line items:', JSON.stringify(zohoLineItems, null, 2));

        const result = await updateInvoice(zohoInvoiceId, { invoice_items: zohoLineItems });

        if (result.status !== 200) {
            console.error('[resync-zoho] Zoho returned error:', result.status, result.data);
            return NextResponse.json(
                {
                    success: false,
                    error: `Zoho returned ${result.status}: ${result.data?.message ?? JSON.stringify(result.data)}`,
                },
                { status: 502 }
            );
        }

        // Clear cached invoiceTotal so the revenue dashboard re-fetches from Zoho
        await Order.updateOne(
            { zohoInvoiceId },
            { $unset: { invoiceTotal: '' } }
        );

        console.log(`[resync-zoho] Successfully synced ${zohoInvoiceId}`);

        return NextResponse.json({
            success: true,
            zohoInvoiceId,
            lineItemsSent: zohoLineItems,
            message: 'Zoho invoice updated successfully. invoiceTotal cache cleared.',
        });
    } catch (error: unknown) {
        console.error('[resync-zoho] Unexpected error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
