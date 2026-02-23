import { NextRequest, NextResponse } from 'next/server';
import { createShipment } from '@/lib/delhivery';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.shipment || !body.pickup_location) {
            return NextResponse.json(
                { error: 'shipment object and pickup_location string are required' },
                { status: 400 }
            );
        }

        const { status, data } = await createShipment(body.shipment, body.pickup_location);
        return NextResponse.json(data, { status });

    } catch (error) {
        console.error('Shipment creation error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create shipment' },
            { status: 500 }
        );
    }
}
