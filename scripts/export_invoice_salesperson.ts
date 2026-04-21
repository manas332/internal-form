/**
 * Export Invoice Numbers and Salesperson Names to CSV
 *
 * Fetches all orders from MongoDB, extracts the invoice number (orderId)
 * and salesperson name, and writes them to a CSV file.
 *
 * Usage:
 *   npx tsx scripts/export_invoice_salesperson.ts
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
        { orderId: 1, salespersonName: 1, _id: 0 }
    )
        .sort({ orderId: 1 })
        .lean();

    console.log(`Found ${orders.length} orders`);

    // Build CSV
    const csvHeaders = ['Invoice Number', 'Salesperson Name'];
    const csvRows: string[] = [csvHeaders.join(',')];

    for (const order of orders) {
        const invoiceNumber = order.orderId || '';
        const salespersonName = order.salespersonName || '';

        csvRows.push(
            [escapeCsv(invoiceNumber), escapeCsv(salespersonName)].join(',')
        );
    }

    const csvContent = csvRows.join('\n');
    const outputPath = path.resolve(
        process.cwd(),
        'invoice_salesperson_report.csv'
    );
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    console.log(`Exported ${orders.length} records to ${outputPath}`);
    process.exit(0);
}

main().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
