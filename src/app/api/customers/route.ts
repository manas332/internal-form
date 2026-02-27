import { NextRequest, NextResponse } from 'next/server';
import { searchCustomers, createCustomer } from '@/lib/zoho';

/**
 * GET /api/customers?q=<search-term>
 * Searches customers by display_name in Zoho.
 */
export async function GET(request: NextRequest) {
    try {
        const q = request.nextUrl.searchParams.get('q') || '';

        if (q.length < 2) {
            return NextResponse.json({ customers: [] });
        }

        const result = await searchCustomers(q);

        // Extract customer list from Zoho response
        const customers = result.data?.customers || [];

        return NextResponse.json({ customers }, { status: 200 });
    } catch (error) {
        console.error('Customer search error:', error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Failed to search customers',
            },
            { status: 500 }
        );
    }
}

/**
 * POST /api/customers
 * Creates a new customer in Zoho.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.display_name) {
            return NextResponse.json(
                { error: 'display_name is required' },
                { status: 400 }
            );
        }

        const payload: Record<string, unknown> = {
            display_name: body.display_name,
        };

        if (body.email) payload.email = body.email;
        if (body.company_name) payload.company_name = body.company_name;
        if (body.gst_no) payload.gst_no = body.gst_no;
        if (body.gst_treatment) payload.gst_treatment = body.gst_treatment;
        if (body.place_of_contact) payload.place_of_contact = body.place_of_contact;
        if (body.billing_address) {
            payload.billing_address = {
                ...body.billing_address,
                // Zoho uses 'street' as the primary address line for invoice rendering
                street: body.billing_address.street || body.billing_address.address || '',
                attention: body.billing_address.attention || body.display_name || '',
            };
        }

        // Pass phone/mobile to Zoho
        if (body.phone) {
            payload.phone = body.phone;
            payload.mobile = body.phone;
        }

        const result = await createCustomer(payload);

        return NextResponse.json(result.data, { status: result.status });
    } catch (error) {
        console.error('Customer creation error:', error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : 'Failed to create customer',
            },
            { status: 500 }
        );
    }
}
