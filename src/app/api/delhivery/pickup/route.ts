import { NextRequest, NextResponse } from 'next/server';
import { createPickupRequest } from '@/lib/delhivery';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.pickup_time || !body.pickup_date || !body.pickup_location || !body.expected_package_count) {
            return NextResponse.json(
                { error: 'Missing required pickup fields' },
                { status: 400 }
            );
        }

        const { status, data } = await createPickupRequest(body);
        return NextResponse.json(data, { status });

    } catch (error) {
        console.error('Pickup request error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create pickup request' },
            { status: 500 }
        );
    }
}
