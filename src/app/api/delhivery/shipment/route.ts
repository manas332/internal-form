import { NextRequest, NextResponse } from 'next/server';
import { createShipment } from '@/lib/delhivery';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body.shipment || !body.pickup_location) {
            return NextResponse.json(
                { error: 'shipment object and pickup_location string are required' },
                { status: 400 }
            );
        }

        // Override seller and return details to securely hide them on the label (using '.')
        // while providing a valid return address (Noida) for RTO routing.
        const processedShipment = {
            ...body.shipment,
            // Provide exact valid routing but explicitly obscure display fields
            return_pin: 201301,
            return_city: "Noida",
            return_state: "Uttar Pradesh",
            return_country: "India",
            return_phone: body.shipment.return_phone && body.shipment.return_phone.trim() ? body.shipment.return_phone : "9999999999",

            // Only hide these if they haven't been explicitly customized in the UI
            return_name: body.shipment.return_name && body.shipment.return_name.trim() ? body.shipment.return_name : ".",
            return_add: body.shipment.return_add && body.shipment.return_add.trim() ? body.shipment.return_add : ".",
            seller_name: body.shipment.seller_name && body.shipment.seller_name.trim() ? body.shipment.seller_name : ".",
            seller_add: body.shipment.seller_add && body.shipment.seller_add.trim() ? body.shipment.seller_add : ".",
            seller_inv: body.shipment.seller_inv && body.shipment.seller_inv.trim() ? body.shipment.seller_inv : "."
        };

        const { status, data } = await createShipment(processedShipment, body.pickup_location);
        return NextResponse.json(data, { status });

    } catch (error) {
        console.error('Shipment creation error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create shipment' },
            { status: 500 }
        );
    }
}
