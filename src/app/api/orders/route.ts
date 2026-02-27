import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';

export async function GET() {
    try {
        await connectDB();
        // Fetch all orders that still need scheduling (fully pending or partially shipped).
        const orders = await Order.find({ status: { $in: ['PENDING_SHIPPING', 'PARTIALLY_SHIPPED'] } }).sort({ createdAt: -1 });
        return NextResponse.json({ success: true, orders }, { status: 200 });
    } catch (error: unknown) {
        console.error('Error fetching orders:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
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
    } catch (error: unknown) {
        console.error('Error creating order:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
