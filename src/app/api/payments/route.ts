import { NextRequest, NextResponse } from 'next/server';
import { createPayment } from '@/lib/zoho';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        // console.log('POST /api/payments called with:', JSON.stringify(body, null, 2));

        // Validate required fields
        const required = ['customer_id', 'amount', 'date', 'invoice_id'];
        for (const field of required) {
            if (!body[field]) {
                return NextResponse.json(
                    { error: `${field} is required` },
                    { status: 400 }
                );
            }
        }

        const result = await createPayment({
            customer_id: body.customer_id,
            payment_mode: body.payment_mode || 'others',
            amount: Number(body.amount),
            date: body.date,
            invoice_id: body.invoice_id,
            description: body.description,
            reference_number: body.reference_number,
        });

        if (result.status !== 200 && result.status !== 201) {
            console.error('Zoho Payment Recording Failed:', JSON.stringify(result.data, null, 2));
            return NextResponse.json(
                { error: result.data.message || 'Zoho API Error' },
                { status: result.status }
            );
        }

        return NextResponse.json(result.data, { status: result.status });
    } catch (error) {
        console.error('Payment recording error:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Failed to record payment',
            },
            { status: 500 }
        );
    }
}
