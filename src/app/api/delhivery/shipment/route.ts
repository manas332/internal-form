import { NextRequest, NextResponse } from 'next/server';
import { createShipment } from '@/lib/delhivery';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Accept either a single shipment or an array of shipments
        const shipments = Array.isArray(body.shipments) ? body.shipments : [body.shipment];
        const pickupLocations = Array.isArray(body.pickup_locations) ? body.pickup_locations : [body.pickup_location];

        if (!shipments || shipments.length === 0 || !pickupLocations || pickupLocations.length === 0) {
            return NextResponse.json(
                { error: 'shipments array and pickup_locations array are required' },
                { status: 400 }
            );
        }

        const results = [];
        for (let i = 0; i < shipments.length; i++) {
            const shipment = shipments[i];
            const pickup_location = pickupLocations[i] || pickupLocations[0];

            const processedShipment = {
                ...shipment,
                return_pin: 201301,
                return_city: "Noida",
                return_state: "Uttar Pradesh",
                return_country: "India",
                return_phone: shipment.return_phone && shipment.return_phone.trim() ? shipment.return_phone : "9999999999",
                return_name: shipment.return_name && shipment.return_name.trim() ? shipment.return_name : ".",
                return_add: shipment.return_add && shipment.return_add.trim() ? shipment.return_add : ".",
                seller_name: shipment.seller_name && shipment.seller_name.trim() ? shipment.seller_name : ".",
                seller_add: shipment.seller_add && shipment.seller_add.trim() ? shipment.seller_add : ".",
                seller_inv: shipment.seller_inv && shipment.seller_inv.trim() ? shipment.seller_inv : "."
            };

            try {
                const { status, data } = await createShipment(processedShipment, pickup_location);
                results.push({ status, data });
            } catch (error) {
                results.push({ status: 500, error: error instanceof Error ? error.message : 'Failed to create shipment' });
            }
        }

        return NextResponse.json({ results }, { status: 200 });

    } catch (error) {
        console.error('Shipment creation error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create shipment' },
            { status: 500 }
        );
    }
}
