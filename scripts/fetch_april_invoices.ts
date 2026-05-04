import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '../.env.local' });

import fs from 'fs';
import path from 'path';

// Helper to escape CSV fields
function escapeCsv(field: string | number | undefined | null): string {
    if (field === null || field === undefined) return '';
    let str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        str = str.replace(/"/g, '""');
        return `"${str}"`;
    }
    return str;
}

async function main() {
    console.log('Loading dependencies...');
    const [{ default: connectDB }, { default: Order }] = await Promise.all([
        import('../src/lib/mongodb'),
        import('../src/models/Order'),
    ]);

    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected.');

    // April 2026 Date Range
    // Note: Assuming the year is 2026 based on the active dates in the system
    const start = new Date('2026-04-01T00:00:00.000Z');
    const end = new Date('2026-04-30T23:59:59.999Z');

    console.log(`Fetching orders created between ${start.toISOString()} and ${end.toISOString()}...`);
    
    const orders = await Order.find({
        createdAt: {
            $gte: start,
            $lte: end
        }
    }).lean() as any[];

    console.log(`✅ Found ${orders.length} orders in April.`);

    const rows: string[][] = [];
    
    // Header
    rows.push([
        'Invoice Number',
        'Item Name',
        'Items Price (Tax Incl)',
        'Cost Price',
        'Discount',
        'Invoice Total'
    ]);

    for (const order of orders) {
        const invoiceNumber = order.orderId || order.zohoInvoiceId || '';
        const invoiceTotal = order.invoiceTotal !== null && order.invoiceTotal !== undefined ? order.invoiceTotal : '';
        // Check for discount field (might not be explicitly in schema, but we extract if exists)
        const discount = order.discount !== undefined ? order.discount : (order.discount_total || '');

        const items = order.invoiceItems || [];
        if (items.length === 0) {
            // Output row even if there are no line items
            rows.push([
                escapeCsv(invoiceNumber),
                '', // Item Name
                '', // Items Price
                '', // Cost Price
                escapeCsv(discount),
                escapeCsv(invoiceTotal)
            ]);
            continue;
        }

        for (const item of items) {
            const itemName = item.name || '';
            
            // final_price is usually the tax-inclusive price per unit. Fallback to rate.
            const itemPrice = item.final_price !== undefined ? item.final_price : (item.rate !== undefined ? item.rate : '');
            const costPrice = item.cost_price !== undefined ? item.cost_price : '';
            
            // Allow item-level discount if it exists, otherwise fall back to order-level
            const itemDiscount = item.discount !== undefined ? item.discount : discount;

            rows.push([
                escapeCsv(invoiceNumber),
                escapeCsv(itemName),
                escapeCsv(itemPrice),
                escapeCsv(costPrice),
                escapeCsv(itemDiscount),
                escapeCsv(invoiceTotal)
            ]);
        }
    }

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const outputPath = path.resolve(process.cwd(), 'april_invoices_report.csv');
    
    fs.writeFileSync(outputPath, csvContent, 'utf-8');
    console.log(`\n📁 Saved report with ${rows.length - 1} line items to: ${outputPath}`);

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
