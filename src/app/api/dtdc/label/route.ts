import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const referenceNumber = searchParams.get('reference_number') || searchParams.get('waybill');

        if (!referenceNumber) {
            return NextResponse.json({ error: 'Reference number is required' }, { status: 400 });
        }

        const apiKey = process.env.DTDC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'DTDC API Key is not configured' }, { status: 500 });
        }

        const response = await fetch(`https://app.shipsy.in/api/customer/integration/consignment/shippinglabel/stream?reference_number=${referenceNumber}`, {
            method: 'GET',
            headers: {
                'api-key': apiKey
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Shipsy Label API Error:', errorText);
            return NextResponse.json({ error: 'Failed to fetch label from DTDC' }, { status: response.status });
        }

        // Return the PDF stream directly
        const pdfBuffer = await response.arrayBuffer();
        
        return new NextResponse(pdfBuffer, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="DTDC-Label-${referenceNumber}.pdf"`,
            }
        });

    } catch (error: any) {
        console.error('Error fetching DTDC label:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
