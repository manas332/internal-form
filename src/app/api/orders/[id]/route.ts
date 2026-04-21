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

        // === USER REQUEST: ONLY ALLOW COST PRICE UPDATES & DISABLE ZOHO ===
        
        // Find existing order BEFORE update to preserve strictly all other fields
        const existingOrder = await Order.findOne({
             $or: [
                 { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
                 { zohoInvoiceId: id },
                 { orderId: id }
             ]
        });

        if (!existingOrder) {
             return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
        }

        const safeSetParams: Record<string, unknown> = {};

        // Only pluck cost_price from incoming invoiceItems
        if (rest.invoiceItems && Array.isArray(rest.invoiceItems) && Array.isArray(existingOrder.invoiceItems)) {
             // Map over existing items in DB to preserve them perfectly
             const protectedItems = existingOrder.invoiceItems.map((dbItem: any, idx: number) => {
                 const incomingItem = rest.invoiceItems[idx];
                 if (incomingItem && typeof incomingItem.cost_price === 'number') {
                     // ONLY update cost_price, preserve all other DB properties
                     const base = dbItem.toObject ? dbItem.toObject() : dbItem;
                     return { ...base, cost_price: incomingItem.cost_price };
                 }
                 return dbItem;
             });
             safeSetParams.invoiceItems = protectedItems;
        }

        const update: Record<string, unknown> = {};
        if (Object.keys(safeSetParams).length > 0) {
             update.$set = safeSetParams;
        }

        if (Array.isArray(shipmentsAppend) && shipmentsAppend.length > 0) {
            update.$push = {
                shipments: { $each: shipmentsAppend },
            };
        }

        const order = await Order.findOneAndUpdate(
            { _id: existingOrder._id },
            Object.keys(update).length > 0 ? update : { $set: {} },
            { new: true }
        );

        if (!order) {
            return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
        }

        // TEMPORARILY DISABLED: 
        // Syncing to Zoho is currently disabled because Zoho's API agressively overwrites
        // custom negotiated prices with catalog defaults when passing item_ids.
        // MongoDB is actively saving the correct custom line items and cost_price!
        
        let zohoUpdated = false;
        /*
        console.log('[PATCH order] invoiceItems present:', !!rest.invoiceItems, '| zohoInvoiceId:', order.zohoInvoiceId ?? '(none)');
        if (rest.invoiceItems && Array.isArray(rest.invoiceItems) && order.zohoInvoiceId) {
            console.log('[PATCH order] Attempting Zoho invoice update for', order.zohoInvoiceId);
            try {
                // 1. Fetch the existing invoice from Zoho first to retrieve line_item_id mappings
                const { getInvoice } = await import('@/lib/zoho');
                let existingInvoice: any = null;
                try {
                    const fetched = await getInvoice(order.zohoInvoiceId);
                    if (fetched.status === 200) {
                         existingInvoice = fetched.data.invoice;
                    }
                } catch(e) {
                    console.error('[PATCH order] Failed to fetch existing invoice for line item mapping', e);
                }

                const zohoLineItems = rest.invoiceItems.map((item: InvoiceItem) => {
                    const itemAny = item as unknown as Record<string, unknown>;
                    const taxPct = typeof itemAny.tax_percentage === 'number' ? itemAny.tax_percentage : 0;

                    let pretaxRate: number = item.price ?? 0;
                    if (item.final_price != null && item.final_price > 0) {
                        if (taxPct > 0) {
                            pretaxRate = item.final_price / (1 + taxPct / 100);
                        } else {
                            pretaxRate = item.final_price;
                        }
                    }

                    const line: Record<string, unknown> = {
                        name: item.name,
                        rate: Math.round(pretaxRate * 100) / 100,
                        quantity: item.quantity,
                    };
                    
                    if (existingInvoice && Array.isArray(existingInvoice.invoice_items)) {
                        const existingMatch = existingInvoice.invoice_items.find((ei: any) => 
                            (item.zoho_item_id && ei.item_id === item.zoho_item_id) || ei.name === item.name
                        );
                        if (existingMatch && existingMatch.line_item_id) {
                            line.line_item_id = existingMatch.line_item_id;
                        }
                    }

                    if (item.hsn_or_sac) line.hsn_or_sac = item.hsn_or_sac;
                    if (item.description) line.description = item.description;
                    if (item.tax_id && item.tax_id !== 'NO_TAX') line.tax_id = item.tax_id;
                    if (item.discount !== undefined) line.discount = item.discount;
                    if (item.unit) line.unit = item.unit;
                    
                    if (item.zoho_item_id && line.line_item_id) {
                        line.item_id = item.zoho_item_id;
                    }

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
                
                if (rest.include_shipping !== undefined) {
                      invoicePatch.shipping_charge = 0; 
                }

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
        */

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
