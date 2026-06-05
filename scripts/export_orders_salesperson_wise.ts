/**
 * Export Orders Salesperson-wise to CSV
 *
 * Fetches all orders from MongoDB and writes the requested fields to a CSV file.
 * Fields: Salesperson, zohoInvoiceId, customer name, customer phone number, customer addresss, invoiceTotal
 *
 * Usage:
 *   npx tsx scripts/export_orders_salesperson_wise.ts
 */  

import { config } from 'dotenv';
// Prefer repo-root .env.local (when running from project root),
// fallback to ../.env.local (when running from within scripts/).
config({ path: '.env.local' });
config({ path: '../.env.local' });

import fs from 'fs';
import path from 'path';

function escapeCsv(field: string | number | undefined | null): string {
    if (field === null || field === undefined) return '';
    let str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        str = str.replace(/"/g, '""');
        return `"${str}"`;
    }
    return str;
}

async function main() {
    console.log('Connecting to database...');
    // IMPORTANT: dynamic imports ensure dotenv has already populated process.env
    // before mongodb.ts reads MONGODB_URI at module initialization.
    const [{ default: connectDB }, { default: Order }] = await Promise.all([
        import('../src/lib/mongodb'),
        import('../src/models/Order'),
    ]);

    await connectDB();
    console.log('Connected to MongoDB');

    // Fetch all orders, projecting only the fields we need
    const orders = await Order.find(
        {},
        {
            salespersonName: 1,
            orderId: 1,
            createdAt: 1,
            'customerDetails.customer_name': 1,
            'customerDetails.phone': 1,
            'customerDetails.address': 1,
            invoiceTotal: 1,
            _id: 0
        }
    )
        .sort({ salespersonName: 1, orderId: 1 })
        .lean();

    console.log(`Found ${orders.length} orders`);

    // Build CSV
    const csvHeaders = [
        'Salesperson',
        'orderId',
        'invoiceDate',
        'customer name',
        'customer phone number',
        'customer address',
        'invoiceTotal'
    ];
    const csvRows: string[] = [csvHeaders.join(',')];

    for (const order of orders) {
        const salesperson = order.salespersonName || '';
        const orderId = order.orderId || '';
        
        let invoiceDate = '';
        if (order.createdAt) {
            try {
                invoiceDate = new Date(order.createdAt).toISOString().split('T')[0];
            } catch (e) {
                invoiceDate = String(order.createdAt);
            }
        }
        
        const customerName = order.customerDetails?.customer_name || '';
        const customerPhone = order.customerDetails?.phone || '';
        const customerAddress = order.customerDetails?.address || '';
        const invoiceTotal = order.invoiceTotal || 0;

        csvRows.push(
            [
                escapeCsv(salesperson),
                escapeCsv(orderId),
                escapeCsv(invoiceDate),
                escapeCsv(customerName),
                escapeCsv(customerPhone),
                escapeCsv(customerAddress),
                escapeCsv(invoiceTotal)
            ].join(',')
        );
    }

    const csvContent = csvRows.join('\n');
    const outputPath = path.resolve(
        process.cwd(),
        'orders_salesperson_wise.csv'
    );
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    console.log(`Exported ${orders.length} records to ${outputPath}`);
    process.exit(0);
}

main().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
