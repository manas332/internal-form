import { NextRequest, NextResponse } from 'next/server';
import { createShipment } from '@/lib/delhivery';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        // Standardize input: support single shipment top-level or { shipment: ... } or { shipments: [...] }
        let shipmentsArray: any[] = [];
        let pickupLocations: string[] = [];

        if (Array.isArray(body.shipments)) {
            shipmentsArray = body.shipments;
            pickupLocations = Array.isArray(body.pickup_locations) ? body.pickup_locations : [body.pickup_location];
        } else if (body.shipment) {
            shipmentsArray = [body.shipment];
            pickupLocations = [body.pickup_location];
        } else if (body.name && body.order) {
            // Top-level shipment object
            shipmentsArray = [body];
            pickupLocations = [body.pickup_location];
        }

        if (shipmentsArray.length === 0) {
            return NextResponse.json(
                { error: 'No valid shipment data provided. Expected shipments[] or a shipment object.' },
                { status: 400 }
            );
        }

        const results = [];
        for (let i = 0; i < shipmentsArray.length; i++) {
            const shipment = shipmentsArray[i];
            const pickup_location = pickupLocations[i] || pickupLocations[0] || shipment.pickup_location;

            if (!pickup_location) {
                results.push({ status: 400, error: `Missing pickup_location for shipment ${i + 1}` });
                continue;
            }

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

        return NextResponse.json({ results, success: results.every(r => r.status === 200) }, { status: 200 });

    } catch (error) {
        console.error('Shipment creation error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create shipment' },
            { status: 500 }
        );
    }
}

