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
    if (str.includes(',') || str.includes('\"') || str.includes('\n')) {
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

    // March 2026 Date Range
    const startDate = new Date('2026-03-01T00:00:00.000Z');
    const endDate = new Date('2026-03-31T23:59:59.999Z');

    const orders = await Order.find({
        createdAt: {
            $gte: startDate,
            $lte: endDate
        }
    }).lean();

    console.log(`Found ${orders.length} orders in March 2026`);

    const csvHeaders = ['Order ID', 'Zoho Invoice ID', 'Customer Name', 'Item Name', 'Description', 'Quantity', 'Final Price', 'Invoice Total'];
    const csvRows: string[] = [];

    csvRows.push(csvHeaders.join(','));

    for (const order of orders) {
        const invoiceItems = order.invoiceItems || [];
        const invoiceTotal = order.invoiceTotal || 0;
        const orderId = order.orderId || '';
        const zohoInvoiceId = order.zohoInvoiceId || '';
        const customerName = order.customerDetails?.customer_name || '';

        for (const item of invoiceItems) {
            const row = [
                escapeCsv(orderId),
                escapeCsv(zohoInvoiceId),
                escapeCsv(customerName),
                escapeCsv(item.name || ''),
                escapeCsv(item.description || ''),
                escapeCsv(item.quantity || 0),
                escapeCsv(item.final_price || 0),
                escapeCsv(invoiceTotal)
            ];
            csvRows.push(row.join(','));
        }
    }

    const csvContent = csvRows.join('\n');
    const outputPath = path.resolve(process.cwd(), 'march_2026_orders.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf-8');

    console.log(`Exported successfully to ${outputPath}`);
    process.exit(0);
}

main().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});
