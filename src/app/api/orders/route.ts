import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';

export async function GET(request: NextRequest) {
    try {
        await connectDB();
        const showAll = request.nextUrl.searchParams.get('all') === 'true';
        const filter = showAll ? {} : { status: { $in: ['PENDING_SHIPPING', 'PARTIALLY_SHIPPED'] } };
        const orders = await Order.find(filter).sort({ createdAt: -1 });
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
