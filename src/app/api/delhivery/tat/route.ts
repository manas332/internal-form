import { NextRequest, NextResponse } from 'next/server';
import { getExpectedTAT } from '@/lib/delhivery';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const origin = searchParams.get('origin_pin');
        const dest = searchParams.get('destination_pin');
        const mot = searchParams.get('mot') as 'S' | 'E' | 'N';
        const pickupDate = searchParams.get('expected_pickup_date'); // optional

        if (!origin || !dest || !mot) {
            return NextResponse.json(
                { error: 'origin_pin, destination_pin and mot are required parameters' },
                { status: 400 }
            );
        }

        const data = await getExpectedTAT(origin, dest, mot, pickupDate || undefined);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Expected TAT error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to get Expected TAT' },
            { status: 500 }
        );
    }
}
