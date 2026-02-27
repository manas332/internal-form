import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import { deleteInvoice } from '@/lib/zoho';

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

        return NextResponse.json({ success: true, order }, { status: 200 });
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

        // 1. Delete invoice from Zoho (best-effort — proceed even if Zoho fails)
        let zohoDeleted = false;
        if (order.zohoInvoiceId) {
            try {
                const result = await deleteInvoice(order.zohoInvoiceId);
                zohoDeleted = result.status === 200;
                if (!zohoDeleted) {
                    console.warn(`Zoho invoice deletion returned ${result.status}:`, result.data?.message);
                }
            } catch (err) {
                console.warn('Failed to delete invoice from Zoho:', err);
            }
        }

        // 2. Delete order from database
        await Order.deleteOne({ _id: order._id });

        return NextResponse.json({
            success: true,
            zohoDeleted,
            message: zohoDeleted
                ? 'Order and Zoho invoice deleted successfully'
                : 'Order deleted from database. Zoho invoice may need manual deletion (it might be in Sent/Paid status).',
        });
    } catch (error: unknown) {
        console.error('Error deleting order:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
