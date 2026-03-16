import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import { updateInvoice, voidInvoice } from '@/lib/zoho';
import { InvoiceItem } from '@/types/invoice';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await connectDB();
        // The id can be the Mongo ID or zohoInvoiceId or orderId -> try all 
        const { id } = await params;
        const order = await Order.findOne({
            $or: [
                { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
                { zohoInvoiceId: id },
                { orderId: id }
            ]
        });

        if (!order) {
            return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, order }, { status: 200 });
    } catch (error: unknown) {
        console.error('Error fetching order:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await connectDB();
        const { id } = await params;
        const data = await request.json();

        // Support both simple "$set" updates and appending shipment records.
        // Client can send:
        // - shipmentsAppend: Shipment[]  -> appended to shipments via $push/$each
        // - ...other fields             -> applied via $set
        const { shipmentsAppend, ...rest } = data ?? {};

        const update: Record<string, unknown> = { $set: rest };

        if (Array.isArray(shipmentsAppend) && shipmentsAppend.length > 0) {
            update.$push = {
                shipments: { $each: shipmentsAppend },
            };
        }

        const order = await Order.findOneAndUpdate(
            {
                $or: [
                    { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
                    { zohoInvoiceId: id },
                    { orderId: id }
                ]
            },
            update,
            { new: true }
        );

        if (!order) {
            return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
        }

        // If invoiceItems were updated and we have a Zoho Invoice ID, push the update to Zoho
        let zohoUpdated = false;
        console.log('[PATCH order] invoiceItems present:', !!rest.invoiceItems, '| zohoInvoiceId:', order.zohoInvoiceId ?? '(none)');
        if (rest.invoiceItems && Array.isArray(rest.invoiceItems) && order.zohoInvoiceId) {
            console.log('[PATCH order] Attempting Zoho invoice update for', order.zohoInvoiceId);
            try {
                // Map the frontend invoice items back to Zoho's invoice_items format.
                // IMPORTANT: Always derive the pre-tax rate from final_price (tax-inclusive per-unit price)
                // so we never re-send stale/wrong `price` values that may be in the DB from the original
                // Zoho invoice creation. item_total is intentionally NOT forwarded — it is the pre-tax
                // aggregate (qty × rate), not a per-unit field, and sending it causes Zoho to use it
                // as an override that produces wildly wrong totals.
                const zohoLineItems = rest.invoiceItems.map((item: InvoiceItem) => {
                    // Cast to a wider type to safely read `tax_percentage`, which is stored in DB
                    // items but not present in the frontend InvoiceItem TypeScript type.
                    const itemAny = item as unknown as Record<string, unknown>;
                    const taxPct = typeof itemAny.tax_percentage === 'number' ? itemAny.tax_percentage : 0;

                    // Recompute pre-tax per-unit rate from final_price (tax-inclusive) so we don't
                    // blindly use stale price stored in DB from an earlier Zoho sync.
                    let pretaxRate: number = item.price ?? 0;
                    if (item.final_price != null && item.final_price > 0) {
                        if (taxPct > 0) {
                            pretaxRate = item.final_price / (1 + taxPct / 100);
                        } else {
                            // No tax — pre-tax rate equals final_price
                            pretaxRate = item.final_price;
                        }
                    }

                    const line: Record<string, unknown> = {
                        name: item.name,
                        rate: Math.round(pretaxRate * 100) / 100,
                        quantity: item.quantity,
                    };
                    
                    if (item.hsn_or_sac) line.hsn_or_sac = item.hsn_or_sac;
                    if (item.zoho_item_id) line.item_id = item.zoho_item_id;
                    if (item.description) line.description = item.description;
                    if (item.tax_id && item.tax_id !== 'NO_TAX') line.tax_id = item.tax_id;
                    if (item.discount !== undefined) line.discount = item.discount;
                    if (item.unit) line.unit = item.unit;
                    // NOTE: item_total deliberately NOT sent to Zoho.
                    // It is a pre-tax aggregate (qty × pre-tax rate), not a per-unit field.
                    // Sending it causes Zoho to override the calculated total with wrong values.

                    return line;
                });

                const invoicePatch: Record<string, unknown> = {
                    invoice_items: zohoLineItems,
                };
                
                if (rest.discount !== undefined) {
                    invoicePatch.discount = rest.discount;
                    if (rest.discount_format_type) {
                      invoicePatch.is_discount_before_tax = rest.discount_format_type === 'fixed' || rest.discount_format_type === 'percentage';
                      if (rest.discount_format_type === 'percentage') {
                         invoicePatch.discount = `${rest.discount}%`;
                      }
                    }
                }
                
                // Shipping charges are managed as line items
                // Explicitly set shipping_charge to 0 to wipe out any previously saved global charge on this invoice
                if (rest.include_shipping !== undefined) {
                      invoicePatch.shipping_charge = 0; 
                }

                // If COD charge exists, we usually add it as an adjustment
                if (rest.include_cod !== undefined) {
                      invoicePatch.adjustment = rest.include_cod ? 50 : 0;
                      invoicePatch.adjustment_description = "COD Charge";
                }

                const result = await updateInvoice(order.zohoInvoiceId, invoicePatch);
                
                zohoUpdated = result.status === 200;
                if (zohoUpdated) {
                    console.log('[PATCH order] Zoho invoice updated successfully:', order.zohoInvoiceId);
                } else {
                    console.error(`[PATCH order] Zoho invoice update FAILED — status ${result.status}:`, result.data?.message ?? result.data);
                }
            } catch (err) {
                console.error('[PATCH order] Exception while updating Zoho invoice:', err);
            }
        } else if (rest.invoiceItems && !order.zohoInvoiceId) {
            console.warn('[PATCH order] invoiceItems present but order has no zohoInvoiceId — skipping Zoho update');
        }

        return NextResponse.json({ success: true, order, zohoUpdated }, { status: 200 });
    } catch (error: unknown) {
        console.error('Error updating order:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/orders/:id
 * Deletes an order from the database AND its corresponding invoice from Zoho Billing.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await connectDB();
        const { id } = await params;

        // Find the order first to get the Zoho invoice ID
        const order = await Order.findOne({
            $or: [
                { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
                { zohoInvoiceId: id },
                { orderId: id }
            ]
        });

        if (!order) {
            return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
        }

        // 1. Void invoice in Zoho (best-effort — proceed even if Zoho fails)
        let zohoVoided = false;
        if (order.zohoInvoiceId) {
            try {
                const result = await voidInvoice(order.zohoInvoiceId);
                zohoVoided = result.status === 200;
                if (!zohoVoided) {
                    console.warn(`Zoho invoice voiding returned ${result.status}:`, result.data?.message);
                }
            } catch (err) {
                console.warn('Failed to void invoice in Zoho:', err);
            }
        }

        // 2. Delete order from database
        await Order.deleteOne({ _id: order._id });

        return NextResponse.json({
            success: true,
            zohoVoided,
            message: zohoVoided
                ? 'Order deleted and Zoho invoice voided successfully'
                : 'Order deleted from database. Zoho invoice may need manual voiding.',
        });
    } catch (error: unknown) {
        console.error('Error deleting order:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
