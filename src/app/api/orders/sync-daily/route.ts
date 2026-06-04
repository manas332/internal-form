import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import dbConnect from '@/lib/mongodb';
import Order from '@/models/Order';

export async function POST() {
    try {
        await dbConnect();

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // Fetch orders that have any shipments created today
        const orders = await Order.find({
            'shipments.createdAt': { $gte: startOfDay, $lte: endOfDay }
        });

        const rowsToInsert: any[][] = [];

        // Formatting date as DDMMYYYY
        const dd = String(startOfDay.getDate()).padStart(2, '0');
        const mm = String(startOfDay.getMonth() + 1).padStart(2, '0');
        const yyyy = startOfDay.getFullYear();
        const formattedDate = `${dd}${mm}${yyyy}`;

        for (const order of orders) {
            for (const shipment of order.shipments || []) {
                const createdAt = new Date(shipment.createdAt);
                if (createdAt >= startOfDay && createdAt <= endOfDay) {
                    let shippingVal = '';
                    let awbVal = '';
                    let selfVal = '';

                    if (shipment.deliveryPartner === 'Delhivery') {
                        shippingVal = 'Delhivery Courier';
                        awbVal = shipment.waybill || '';
                    } else if (shipment.deliveryPartner === 'DTDC') {
                        shippingVal = 'DTDC';
                        awbVal = shipment.awb || shipment.waybill || '';
                    } else {
                        shippingVal = shipment.deliveryPartner || '';
                        awbVal = shipment.waybill || '';
                        selfVal = 'Self';
                    }

                    const invoiceNumber = order.orderId || order.zohoInvoiceId || '';
                    const fromVal = shipment.warehouse || '';
                    const toVal = order.customerDetails?.customer_name || '';

                    // [Date, Shipping, Invoice Number, AWB, Self, From, To]
                    rowsToInsert.push([
                        formattedDate,
                        shippingVal,
                        invoiceNumber,
                        awbVal,
                        selfVal,
                        fromVal,
                        toVal
                    ]);
                }
            }
        }

        if (rowsToInsert.length === 0) {
            return NextResponse.json({ message: 'No shipments scheduled today to sync.' }, { status: 200 });
        }

        // Setup Google Sheets auth
        const auth = new google.auth.JWT({
            email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const sheetId = process.env.GOOGLE_SHEET_ID;

        if (!sheetId) {
            throw new Error('GOOGLE_SHEET_ID is missing from environment variables');
        }

        // Append to 'daily_orders' sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: 'daily_orders!A:G', // Adjust to match exact tab name
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: rowsToInsert,
            },
        });

        return NextResponse.json({ message: `Successfully synced ${rowsToInsert.length} shipments.` }, { status: 200 });

    } catch (error: any) {
        console.error('Error syncing daily orders:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
