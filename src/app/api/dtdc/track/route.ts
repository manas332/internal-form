import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const referenceNumber = searchParams.get('reference_number') || searchParams.get('waybill');

        if (!referenceNumber) {
            return NextResponse.json({ error: 'Reference number is required' }, { status: 400 });
        }

        const apiKey = process.env.DTDC_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'DTDC API Key is not configured' }, { status: 500 });
        }

        const response = await fetch(`https://app.shipsy.in/api/customer/integration/consignment/track?reference_number=${referenceNumber}`, {
            method: 'GET',
            headers: {
                'api-key': apiKey
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Shipsy Track API Error:', data);
            return NextResponse.json(data, { status: response.status });
        }

        // Map DTDC tracking data to the format expected by the frontend (Delhivery format)
        // This avoids rewriting the entire TrackingDashboard frontend just for DTDC
        
        // Example DTDC status: "pickup_scheduled", "reachedathub", etc.
        // Delhivery statuses: "Manifested", "In Transit", "Pending", "Dispatched", "Picked Up", "Out for Delivery", "Delivered", "RTO"
        let mappedStatus = 'Pending';
        const dtdcStatus = (data.status || '').toLowerCase();
        
        if (dtdcStatus.includes('delivered')) mappedStatus = 'Delivered';
        else if (dtdcStatus.includes('out') && dtdcStatus.includes('delivery')) mappedStatus = 'Out for Delivery';
        else if (dtdcStatus.includes('rto') || dtdcStatus.includes('return')) mappedStatus = 'RTO';
        else if (dtdcStatus.includes('transit') || dtdcStatus.includes('reachedathub')) mappedStatus = 'In Transit';
        else if (dtdcStatus.includes('picked')) mappedStatus = 'Picked Up';
        else if (dtdcStatus.includes('scheduled')) mappedStatus = 'Manifested';

        const delhiveryFormatResponse = {
            ShipmentData: [
                {
                    Shipment: {
                        AWB: data.reference_number || data.customer_reference_number,
                        ReferenceNo: data.customer_reference_number || data.reference_number,
                        CurrentStatus: {
                            Status: mappedStatus,
                            StatusType: mappedStatus.toUpperCase(),
                            StatusDateTime: data.creation_date ? new Date(data.creation_date).toISOString() : new Date().toISOString()
                        },
                        ExpectedDeliveryDate: null, // DTDC tracking API example doesn't show expected date
                        Consignee: {
                            Name: data.receiver_name || "Customer"
                        },
                        Destination: data.hub_code || "Unknown",
                        InvoiceAmount: data.cod_amount || 0,
                        Scans: (data.events || []).map((ev: any) => ({
                            ScanDetail: {
                                ScanType: ev.type,
                                Scan: ev.customer_update,
                                ScanDateTime: ev.event_time ? new Date(ev.event_time).toISOString() : null,
                                Instructions: ev.notes || ev.customer_update,
                                ScannedLocation: ev.hub_name || ev.hub_code
                            }
                        }))
                    }
                }
            ]
        };

        return NextResponse.json(delhiveryFormatResponse);

    } catch (error: any) {
        console.error('Error fetching DTDC tracking:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
