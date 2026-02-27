import { NextRequest, NextResponse } from 'next/server';
import { trackShipment } from '@/lib/delhivery';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const waybillsStr = searchParams.get('waybills') || '';

        if (!waybillsStr) {
            return NextResponse.json({ error: 'waybills query parameter is required' }, { status: 400 });
        }

        const waybills = waybillsStr.split(',').map(w => w.trim()).filter(Boolean);

        // Process all waybills in parallel on the server
        const results = await Promise.allSettled(
            waybills.map(async (wb) => {
                const { status, data } = await trackShipment(wb);
                return { waybill: wb, status, data };
            })
        );

        // Map the results back to a clean array of statuses
        const formattedResults = results.map(result => {
            if (result.status === 'fulfilled') {
                return result.value;
            }
            // For rejected promises, just return an error structure
            return {
                waybill: "UNKNOWN",
                status: 500,
                error: true
            };
        });

        return NextResponse.json({ success: true, results: formattedResults }, { status: 200 });

    } catch (error) {
        console.error('Bulk Tracking error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to track shipments in bulk' },
            { status: 500 }
        );
    }
}
