import { NextRequest, NextResponse } from 'next/server';
import { getCustomer } from '@/lib/zoho';

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
