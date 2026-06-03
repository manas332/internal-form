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

        // Allow updating core order properties, but strictly protect the invoiceItems array
        const safeSetParams: Record<string, unknown> = {};
        
        // Allowed root-level fields from the frontend
        const allowedFields = ['status', 'selfShipped', 'waybill', 'waybills', 'shippingCost', 'selfShipmentStatus', 'selfShipmentNotes', 'selfShipmentProvider', 'selfShipmentAWB'];
        for (const field of allowedFields) {
            if (rest[field] !== undefined) {
                safeSetParams[field] = rest[field];
            }
        }

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

        const zohoUpdated = false; // Zoho syncing permanently disabled in this flow
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
