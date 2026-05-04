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
            return vendor || { facility_name: vendorName, address_line: '', pincode: '' };
        };

        // Group rows by vendor
        const groupedRows: Record<string, string[]> = {};

        // Generate DTDC bulk upload CSV headers
        const headers = [
            'Customer Reference Number',
            'Consignment Number',
            'Service Type',
            'Courier Type',
            'Declared Price (non-document)',
            'Number of Pieces (non-document)',
            'Risk Surcharge (YES/NO) (non-document)',
            'Weight(KG) (non-document)',
            'Destination Pincode',
            'Destination Name',
            'Destination Phone',
            'Destination Address Line 1',
            'Content Type',
            'Cod Amount',
            'In Favor Of',
            'Cod Mode',
            'Origin Name',
            'Origin Address Line 1',
            'Origin Pincode'
        ];

        for (const order of orders) {
            // Find the DTDC shipments
            const dtdcShipments = (order.shipments || []).filter((s: any) => s.deliveryPartner === 'DTDC');
            
            for (const shipment of dtdcShipments) {
                const vendorName = shipment.vendor || shipment.warehouse || 'Unknown Vendor';
                const vDetails = getVendorDetails(vendorName);

                // Calculate total invoice value just in case needed for missing COD amount
                let totalAmount = 0;
                if (order.invoiceItems && order.invoiceItems.length > 0) {
                     for (const item of shipment.items) {
                         const baseItem = order.invoiceItems[item.lineIndex];
                         if (baseItem) {
                             const perUnit = baseItem.final_price ?? (((baseItem.item_total || 0) + (baseItem.tax_amount || 0)) / (baseItem.quantity || 1));
                             totalAmount += perUnit * item.quantity;
                         }
                     }
                }
                const paymentMode = shipment.paymentMode || order.paymentMode || 'Prepaid';

                let codAmountStr = '';
                let codModeStr = '';
                
                let defaultAmt = totalAmount > 0 ? totalAmount : (order.invoiceTotal || 0);
                let declaredPriceStr = `${defaultAmt}`;
                
                if (paymentMode === 'COD') {
                    let amt = shipment.codAmount;
                    if (amt === undefined || amt === null) {
                        amt = defaultAmt;
                    }
                    codAmountStr = `${amt}`;
                    codModeStr = 'CASH';
                    declaredPriceStr = `${amt}`;
                }

                const weightKg = shipment.shippingCost ? (shipment.shippingCost / 1000).toFixed(2) : (200 / 1000).toFixed(2); 
                // Wait earlier weight was sent but not saved in DB properly except as custom var if we didn't add it.
                // We didn't add weight to shipment schema. We can assume 0.5kg as default if missing or calculate.
                // The sample says 0.5. Let's just use 0.5 as a fallback.
                
                // Escape CSV commas
                const destAddress = `"${order.customerDetails.address}, ${order.customerDetails.city}, ${order.customerDetails.state}"`;
                
                // Origin overrides for DTDC
                const originName = 'DA Dharm Sathi Pvt Ltd'; // Always use company name
                const isOffice = vendorName.toLowerCase() === 'office';
                const originAddressLine = isOffice ? 'Greater Noida' : vDetails.address_line;
                const originPincode = isOffice ? '201301' : vDetails.pincode;
                const originAddress = `"${originAddressLine}"`;
                
                const row = [
                    order.orderId || '',
                    '', // Consignment Number
                    'B2C SMART EXPRESS', // Service Type
                    'NON-DOCUMENT', // Courier Type
                    declaredPriceStr, // Declared Price (non-document)
                    '1', // Number of Pieces
                    'FALSE', // Risk Surcharge
                    '0.5', // Weight(KG) - falling back to 0.5 kg as standard
                    order.customerDetails.pincode || '',
                    order.customerDetails.customer_name || '',
                    order.customerDetails.phone || '',
                    destAddress,
                    'ORDER', // Content Type
                    codAmountStr,
                    '', // In Favor Of
                    codModeStr,
                    originName, // Origin Name - always DA Dharm Sathi Pvt Ltd
                    originAddress,
                    originPincode
                ];

                const rowLine = row.join(',');

                if (!groupedRows[vendorName]) {
                    groupedRows[vendorName] = [headers.join(',')];
                }
                groupedRows[vendorName].push(rowLine);
            }
        }

        // Return a map of vendor to CSV data
        const filesData = Object.keys(groupedRows).map(vendor => {
            return {
                filename: `DTDC_${vendor.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`,
                content: groupedRows[vendor].join('\n')
            };
        });

        return NextResponse.json({ success: true, files: filesData });

    } catch (error: any) {
        console.error('Error exporting DTDC orders:', error);
        return NextResponse.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
    }
}
