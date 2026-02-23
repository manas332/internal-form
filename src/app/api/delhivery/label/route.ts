import { NextRequest, NextResponse } from 'next/server';
import { generateShippingLabel } from '@/lib/delhivery';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const waybill = searchParams.get('waybill');
        const pdfSize = searchParams.get('pdf_size') || 'A4';

        if (!waybill) {
            return NextResponse.json({ error: 'waybill query parameter is required' }, { status: 400 });
        }

        const { status, data } = await generateShippingLabel(waybill, pdfSize);
        return NextResponse.json(data, { status });
    } catch (error) {
        console.error('Label generation error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to generate label' },
            { status: 500 }
        );
    }
}
