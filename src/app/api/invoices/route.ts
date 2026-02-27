import { NextRequest, NextResponse } from 'next/server';
import { createInvoice, createZohoItem } from '@/lib/zoho';
import { getCorrectTaxId } from '@/lib/tax';

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

        // Auto-create any new items (those without a zoho_item_id) in Zoho's catalog.
        // This MUST succeed for all items before the invoice is created — failure blocks the invoice.
        const rawItems: Array<Record<string, unknown>> = body.invoice_items;
        for (let i = 0; i < rawItems.length; i++) {
            const item = rawItems[i];
            if (item.zoho_item_id) continue; // already in Zoho catalog — skip

            // Determine product_type based on HSN SAC code (6-digit SAC codes are services)
            const hsn = String(item.hsn_or_sac || '');
            const product_type = hsn.length <= 6 ? 'service' : 'goods';

            try {
                const { data } = await createZohoItem({
                    name: String(item.name),
                    description: item.description ? String(item.description) : undefined,
                    rate: Number(item.price) || 0,
                    hsn_or_sac: hsn,
                    product_type,
                    tax_id: item.tax_id ? String(item.tax_id) : undefined,
                });
                // Stamp the fresh item_id back so the invoice line links to it
                if (data?.item?.item_id) {
                    rawItems[i] = { ...item, zoho_item_id: data.item.item_id };
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                console.error(`Failed to create Zoho item for row ${i + 1}:`, message);
                return NextResponse.json(
                    { error: `Could not save new product "${item.name}" to Zoho: ${message}` },
                    { status: 400 }
                );
            }
        }

        // Determine if interstate based on place of supply (Haryana = 06 or HR)
        const pos = String(body.place_of_supply || '').toUpperCase();
        const isInterstate = pos !== 'HR' && pos !== 'HARYANA' && pos !== '06';

        // Fallback 0% tax IDs (for items with no HSN in the map)
        const IGST0 = '3355221000000032367';
        const GST0 = '3355221000000032439';
        const defaultTaxId = isInterstate ? IGST0 : GST0;

        const cleanItems = rawItems.map(
            (item: Record<string, unknown>) => {
                // Append carat size to the item name when provided
                const caratSize = item.carat_size != null && item.carat_size !== ''
                    ? Number(item.carat_size)
                    : null;
                const itemName = caratSize != null
                    ? `${item.name} ${caratSize.toFixed(2)} carat`
                    : item.name;

                const cleaned: Record<string, unknown> = {
                    name: itemName,
                    quantity: Number(item.quantity) || 1,
                    price: Number(item.price) || 0,
                };

                // Link to catalog product if ID is known (and not a system charge)
                const catalogId = item.zoho_item_id || item.product_id;
                if (catalogId && catalogId !== '__system__') {
                    cleaned.product_id = catalogId;
                }

                // NOTE: We intentionally do NOT send description to Zoho anymore,
                // so that the optional internal description stays out of the invoice PDF.
                if (item.discount) cleaned.discount = Number(item.discount);

                // Server-side tax correction: if item has an HSN in the map,
                // force the correct tax_id regardless of what client sent.
                const hsn = item.hsn_or_sac ? String(item.hsn_or_sac) : '';
                const mapTaxId = hsn ? getCorrectTaxId(hsn, isInterstate) : '';

                if (mapTaxId && mapTaxId !== 'NO_TAX') {
                    // HSN is in the map and has a non-zero rate → use map tax_id
                    cleaned.tax_id = mapTaxId;
                } else if (item.tax_id && item.tax_id !== 'NO_TAX') {
                    // HSN not in map but client provided a specific tax → pass through
                    cleaned.tax_id = item.tax_id;
                } else {
                    // Fallback to correct 0% tax_id
                    cleaned.tax_id = defaultTaxId;
                }

                if (item.tax_exemption_id) cleaned.tax_exemption_id = item.tax_exemption_id;
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
            // Suppress the Ship To block on the invoice PDF by sending blank shipping address.
            // Field is 'street' (not 'address') per Zoho Billing API spec.
            shipping_address: {
                street: ' ',
                city: ' ',
                state: ' ',
                zip: ' ',
                country: ' ',
            },
        };

        // Optional fields
        // NOTE: due_date, payment_terms, payment_terms_label, and terms are
        // intentionally NOT sent — user uses payment QR instead.
        if (body.reference_number) payload.reference_number = body.reference_number;
        if (body.gst_treatment) payload.gst_treatment = body.gst_treatment;
        if (body.gst_no) payload.gst_no = body.gst_no;
        if (body.place_of_supply) payload.place_of_supply = body.place_of_supply;
        if (body.salesperson_name)
            payload.salesperson_name = body.salesperson_name;
        if (body.notes) payload.notes = body.notes;
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

        if (result.status !== 200 && result.status !== 201) {
            console.error('Zoho Invoice Creation Failed:', JSON.stringify(result.data, null, 2));
            return NextResponse.json(
                { error: result.data.message || 'Zoho API Error' },
                { status: result.status }
            );
        }

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
