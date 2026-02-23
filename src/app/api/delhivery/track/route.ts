import { NextRequest, NextResponse } from 'next/server';
import { trackShipment } from '@/lib/delhivery';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const waybill = searchParams.get('waybill') || undefined;
        const refIds = searchParams.get('ref_ids') || undefined;

        if (!waybill && !refIds) {
            return NextResponse.json({ error: 'waybill or ref_ids query parameter is required' }, { status: 400 });
        }

        const { status, data } = await trackShipment(waybill, refIds);
        return NextResponse.json(data, { status });
    } catch (error) {
        console.error('Tracking error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to track shipment' },
            { status: 500 }
        );
    }
}
