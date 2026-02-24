import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';

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
    } catch (error: any) {
        console.error('Error fetching order:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await connectDB();
        const { id } = await params;
        const data = await request.json();

        const order = await Order.findOneAndUpdate(
            {
                $or: [
                    { _id: mongoose.Types.ObjectId.isValid(id) ? id : null },
                    { zohoInvoiceId: id },
                    { orderId: id }
                ]
            },
            { $set: data },
            { new: true }
        );

        if (!order) {
            return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, order }, { status: 200 });
    } catch (error: any) {
        console.error('Error updating order:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
