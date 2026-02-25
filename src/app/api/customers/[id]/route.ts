import { NextRequest, NextResponse } from 'next/server';
import { getCustomer, updateCustomer } from '@/lib/zoho';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const result = await getCustomer(resolvedParams.id);

        if (!result.data || !result.data.customer) {
            return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
        }

        return NextResponse.json({ customer: result.data.customer }, { status: 200 });
    } catch (error) {
        console.error('Error fetching customer by ID:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch customer' },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/customers/:id
 * Updates billing_address and/or phone for an existing Zoho customer.
 * Called from CustomerStep when an existing customer has no address on file.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await params;
        const body = await request.json();

        const payload: Record<string, unknown> = {};

        if (body.billing_address) {
            payload.billing_address = body.billing_address;
        }
        if (body.phone) {
            payload.phone = body.phone;
            payload.mobile = body.phone;
        }

        if (Object.keys(payload).length === 0) {
            return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
        }

        const result = await updateCustomer(resolvedParams.id, payload);

        if (result.status !== 200) {
            return NextResponse.json(
                { error: result.data?.message || 'Failed to update customer in Zoho' },
                { status: result.status }
            );
        }

        return NextResponse.json({ customer: result.data.customer }, { status: 200 });
    } catch (error) {
        console.error('Error updating customer:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to update customer' },
            { status: 500 }
        );
    }
}
