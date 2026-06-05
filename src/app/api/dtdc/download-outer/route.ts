import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        // Parse query params for date range
        const { searchParams } = new URL(request.url);
        const startStr = searchParams.get('start');
        const endStr = searchParams.get('end');

        let query: any = { status: 'DTDC_SCHEDULED', 'shipments.deliveryPartner': 'DTDC' };

        if (startStr && endStr) {
            query.updatedAt = {
                $gte: new Date(startStr),
                $lte: new Date(endStr)
            };
        }

        const orders = await Order.find(query).lean();

        // Read vendors configuration to get addresses
        const vendorsPath = path.join(process.cwd(), 'vendors.json');
        let vendorsData: any[] = [];
        try {
            const rawVendors = fs.readFileSync(vendorsPath, 'utf-8');
            vendorsData = JSON.parse(rawVendors);
        } catch (err) {
            console.error('Error reading vendors.json', err);
        }

        const getVendorDetails = (vendorName: string) => {
            const vendor = vendorsData.find(v => v.facility_name.toLowerCase() === vendorName.toLowerCase());
            return vendor || { facility_name: vendorName, address_line: '', pincode: '', phone: '' };
        };

        const groupedRows: Record<string, string[]> = {};

        const headers = [
            'customerReference number',
            'consingment number',
            'consingment type',
            'origin-pincode',
            'origin-address-line-1',
            'line-2',
            'origin name',
            'origin phone',
            'destination name',
            'destination addr line 1',
            'line2',
            'destination phone',
            'destination pincode',
            'weight',
            'courier type',
            'content-type',
            'Declared price',
            'lenngth',
            'width',
            'height',
            'eway bill',
            'cod amount',
            'inFavourOf',
            'cod mode'
        ];

        for (const order of orders) {
            // Find the DTDC shipments
            const dtdcShipments = (order.shipments || []).filter((s: any) => s.deliveryPartner === 'DTDC');
            
            for (const shipment of dtdcShipments) {
                const vendorName = shipment.vendor || shipment.warehouse || 'Unknown Vendor';
                const vDetails = getVendorDetails(vendorName);

                const paymentMode = shipment.paymentMode || order.paymentMode || 'Prepaid';

                let codAmountStr = '';
                let codModeStr = '';
                
                let defaultAmt = order.invoiceTotal || 0;
                let declaredPriceStr = `${defaultAmt}`;
                
                if (paymentMode === 'COD') {
                    let amt = shipment.codAmount;
                    if (amt === undefined || amt === null || amt === '') {
                        amt = defaultAmt;
                    }
                    codAmountStr = `${amt}`;
                    codModeStr = 'CASH';
                }

                // Clean CSV fields
                const destAddress = `"${(order.customerDetails.address || '').replace(/"/g, '""')}, ${(order.customerDetails.city || '').replace(/"/g, '""')}, ${(order.customerDetails.state || '').replace(/"/g, '""')}"`;
                
                const originName = 'DA Dharm Sathi Pvt. Ltd.';
                const isOffice = vendorName.toLowerCase() === 'office';
                const originAddressLine = isOffice ? 'Greater Noida' : vDetails.address_line;
                const originPincode = isOffice ? '201301' : vDetails.pincode;
                const originAddress = `"${(originAddressLine || '').replace(/"/g, '""')}"`;
                
                const row = [
                    order.orderId || '',
                    '', // consingment number
                    'Reverse', // consingment type
                    originPincode || '',
                    originAddress,
                    '', // line-2
                    originName,
                    vDetails.phone || '', // origin phone
                    `"${(order.customerDetails.customer_name || '').replace(/"/g, '""')}"`,
                    destAddress,
                    '', // line2
                    order.customerDetails.phone || '',
                    order.customerDetails.pincode || '',
                    '0.5', // weight
                    'non-document', // courier type
                    'order', // content-type
                    declaredPriceStr, // Declared price
                    '10', // lenngth
                    '10', // width
                    '10', // height
                    '', // eway bill
                    codAmountStr, // cod amount
                    '', // inFavourOf
                    codModeStr // cod mode
                ];

                const rowLine = row.join(',');

                if (!groupedRows[vendorName]) {
                    groupedRows[vendorName] = [headers.join(',')];
                }
                groupedRows[vendorName].push(rowLine);
            }
        }

        const filesData = Object.keys(groupedRows).map(vendor => {
            return {
                filename: `DTDC_Outer_${vendor.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`,
                content: groupedRows[vendor].join('\n')
            };
        });

        return NextResponse.json({ success: true, files: filesData });

    } catch (error: any) {
        console.error('Error exporting DTDC Outer orders:', error);
        return NextResponse.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
    }
}
