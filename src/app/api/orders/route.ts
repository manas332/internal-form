import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';

export async function GET(request: NextRequest) {
    try {
        await connectDB();
        // Fetch all pending orders
        const orders = await Order.find({ status: 'PENDING_SHIPPING' }).sort({ createdAt: -1 });
        return NextResponse.json({ success: true, orders }, { status: 200 });
    } catch (error: any) {
        console.error('Error fetching orders:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        await connectDB();
        const data = await request.json();
        const order = await Order.create(data);
        return NextResponse.json({ success: true, order }, { status: 201 });
    } catch (error: any) {
        console.error('Error creating order:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
