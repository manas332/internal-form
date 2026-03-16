import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';

/**
 * POST /api/orders/:id/recalculate-total
 *
 * Recalculates invoiceTotal from the line items stored in MongoDB:
 *   invoiceTotal = sum( item_total + tax_amount ) for each line item
 *
 * This restores the correct order total on the revenue dashboard without
 * needing to hit the Zoho API.
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
        const items = orderAny.invoiceItems as Array<Record<string, unknown>> | undefined;

        if (!items || items.length === 0) {
            return NextResponse.json(
                { success: false, error: 'Order has no invoice items' },
                { status: 400 }
            );
        }

        // Calculate total from stored line-item fields
        const breakdown = items.map((item) => {
            const itemTotal = typeof item.item_total === 'number' ? item.item_total : 0;
            const taxAmount = typeof item.tax_amount === 'number' ? item.tax_amount : 0;
            return {
                name: item.name,
                item_total: itemTotal,
                tax_amount: taxAmount,
                line_total: itemTotal + taxAmount,
            };
        });

        const invoiceTotal = Math.round(
            breakdown.reduce((sum, b) => sum + b.line_total, 0) * 100
        ) / 100;

        console.log(`[recalculate-total] ${orderAny.orderId} — breakdown:`, breakdown);
        console.log(`[recalculate-total] Computed invoiceTotal: ${invoiceTotal}`);

        // Persist back to DB
        await Order.updateOne(
            { _id: (order as Record<string, unknown>)._id },
            { $set: { invoiceTotal } }
        );

        return NextResponse.json({
            success: true,
            orderId: orderAny.orderId,
            invoiceTotal,
            breakdown,
        });
    } catch (error: unknown) {
        console.error('[recalculate-total] Error:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
