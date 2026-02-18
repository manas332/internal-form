import { NextRequest, NextResponse } from 'next/server';
import { getInvoicePdf } from '@/lib/zoho';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;


        if (!id) {
            return NextResponse.json(
                { error: 'Invoice ID is required' },
                { status: 400 }
            );
        }

        const pdfBuffer = await getInvoicePdf(id);


        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`,
                'Content-Length': String(pdfBuffer.byteLength),
            },
        });
    } catch (error) {

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Failed to download invoice PDF',
            },
            { status: 500 }
        );
    }
}
