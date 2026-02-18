import { NextRequest, NextResponse } from 'next/server';
import { createInvoice } from '@/lib/zoho';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Validate required fields
        if (!body.customer_id) {
            return NextResponse.json(
                { error: 'customer_id is required' },
                { status: 400 }
            );
        }

        if (!body.invoice_items || body.invoice_items.length === 0) {
            return NextResponse.json(
                { error: 'At least one invoice item is required' },
                { status: 400 }
            );
        }

        if (!body.date) {
            return NextResponse.json(
                { error: 'Invoice date is required' },
                { status: 400 }
            );
        }

        // Clean up invoice items — ensure numbers
        const cleanItems = body.invoice_items.map(
            (item: Record<string, unknown>) => {
                const cleaned: Record<string, unknown> = {
                    name: item.name,
                    quantity: Number(item.quantity) || 1,
                    price: Number(item.price) || 0,
                };

                if (item.product_id) cleaned.product_id = item.product_id;
                if (item.description) cleaned.description = item.description;
                if (item.discount) cleaned.discount = Number(item.discount);
                if (item.tax_id) cleaned.tax_id = item.tax_id;
                if (item.hsn_or_sac) cleaned.hsn_or_sac = item.hsn_or_sac;
                if (item.unit) cleaned.unit = item.unit;

                return cleaned;
            }
        );

        // Build request payload
        const payload: Record<string, unknown> = {
            customer_id: body.customer_id,
            date: body.date,
            invoice_items: cleanItems,
        };

        // Optional fields
        if (body.due_date) payload.due_date = body.due_date;
        if (body.payment_terms) payload.payment_terms = Number(body.payment_terms);
        if (body.payment_terms_label)
            payload.payment_terms_label = body.payment_terms_label;
        if (body.reference_number) payload.reference_number = body.reference_number;
        if (body.gst_treatment) payload.gst_treatment = body.gst_treatment;
        if (body.gst_no) payload.gst_no = body.gst_no;
        if (body.place_of_supply) payload.place_of_supply = body.place_of_supply;
        if (body.salesperson_name)
            payload.salesperson_name = body.salesperson_name;
        if (body.notes) payload.notes = body.notes;
        if (body.terms) payload.terms = body.terms;
        if (body.shipping_charge)
            payload.shipping_charge = body.shipping_charge;
        if (body.adjustment !== undefined)
            payload.adjustment = Number(body.adjustment);
        if (body.adjustment_description)
            payload.adjustment_description = body.adjustment_description;
        if (body.discount) payload.discount = Number(body.discount);
        if (body.discount_type) payload.discount_type = body.discount_type;
        if (body.is_discount_before_tax !== undefined)
            payload.is_discount_before_tax = body.is_discount_before_tax;
        if (body.is_inclusive_tax !== undefined)
            payload.is_inclusive_tax = body.is_inclusive_tax;
        if (body.custom_fields) payload.custom_fields = body.custom_fields;

        const result = await createInvoice(payload);

        return NextResponse.json(result.data, { status: result.status });
    } catch (error) {
        console.error('Invoice creation error:', error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error ? error.message : 'Failed to create invoice',
            },
            { status: 500 }
        );
    }
}
