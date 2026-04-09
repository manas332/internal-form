/**
 * One-off script: Fetch INV-000491 from Zoho and insert into MongoDB.
 *
 * Usage:  npx tsx scripts/sync_inv_000491.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '../.env.local' });

// Cost prices for each item (not stored in Zoho)
const COST_PRICES: Record<string, number> = {
    'panna': 2500,
    'neelam': 4000,
};

async function main() {
    const [{ default: connectDB }, { default: Order }, { getAccessToken, getInvoice }] = await Promise.all([
        import('../src/lib/mongodb'),
        import('../src/models/Order'),
        import('../src/lib/zoho'),
    ]);

    const INVOICE_NUMBER = 'INV-000491';

    // 1. Search Zoho for the invoice by number
    console.log(`Searching Zoho for ${INVOICE_NUMBER}...`);
    const token = await getAccessToken();
    const orgId = process.env.ZOHO_ORG_ID!;

    const searchRes = await fetch(
        `https://www.zohoapis.in/billing/v1/invoices?invoice_number=${encodeURIComponent(INVOICE_NUMBER)}`,
        {
            method: 'GET',
            headers: {
                Authorization: `Zoho-oauthtoken ${token}`,
                'X-com-zoho-subscriptions-organizationid': orgId,
                'Content-Type': 'application/json',
            },
        }
    );
    const searchData = await searchRes.json();
    const invoices: any[] = searchData.invoices || [];

    if (invoices.length === 0) {
        console.error(`❌ ${INVOICE_NUMBER} not found in Zoho!`);
        process.exit(1);
    }

    // 2. Fetch full invoice details
    const invoiceId = invoices[0].invoice_id;
    console.log(`Found invoice_id: ${invoiceId}. Fetching details...`);

    const fullRes = await getInvoice(invoiceId);
    if (fullRes.status !== 200 || !fullRes.data?.invoice) {
        console.error(`❌ Failed to fetch invoice details (HTTP ${fullRes.status})`);
        process.exit(1);
    }

    const inv = fullRes.data.invoice;
    console.log(`✅ Zoho Invoice: ${inv.invoice_number} | Customer: ${inv.customer_name} | Total: ₹${inv.total}`);

    // 3. Map items with cost prices
    const mappedItems = (inv.invoice_items || []).map((it: any) => {
        const nameLower = (it.name || '').toLowerCase();
        // Match cost price by checking if item name contains the keyword
        let costPrice = 0;
        for (const [keyword, price] of Object.entries(COST_PRICES)) {
            if (nameLower.includes(keyword)) {
                costPrice = price;
                break;
            }
        }

        console.log(`   • ${it.name} × ${it.quantity} @ ₹${it.rate} → cost_price: ₹${costPrice}`);

        return {
            item_id: it.item_id,
            name: it.name,
            description: it.description || '',
            quantity: it.quantity,
            rate: it.rate,
            item_total: it.item_total,
            tax_id: it.tax_id,
            tax_percentage: it.tax_percentage || 0,
            tax_amount: it.tax_amount || 0,
            final_price: it.item_total + (it.tax_amount || 0),
            hsn_or_sac: it.hsn_or_sac || '',
            carat_size: '',
            cost_price: costPrice,
        };
    });

    // 4. Build order payload
    const shipping = inv.shipping_address || {};
    const billing = inv.billing_address || {};

    const orderPayload = {
        zohoInvoiceId: inv.invoice_id,
        orderId: inv.invoice_number,
        customerDetails: {
            customer_name: inv.customer_name || '',
            email: inv.email || '',
            phone: '',
            country_code: '+91',
            address: shipping.street || billing.street || '',
            city: shipping.city || billing.city || '',
            state: shipping.state || billing.state || '',
            country: shipping.country || billing.country || 'India',
            pincode: shipping.zip || billing.zip || '',
        },
        invoiceItems: mappedItems,
        invoiceTotal: Number(inv.total) || 0,
        salespersonName: inv.salesperson_name || '',
        paymentMode: inv.balance === 0 ? 'Prepaid' : 'COD',
        status: 'PENDING_SHIPPING',  // ← Makes it visible in Schedule Order wizard
    };

    // 5. Connect to DB and insert
    console.log('\nConnecting to MongoDB...');
    await connectDB();

    // Check if it already exists
    const existing = await Order.findOne({ orderId: INVOICE_NUMBER });
    if (existing) {
        console.log(`⚠️  ${INVOICE_NUMBER} already exists in DB (_id: ${existing._id}). Skipping.`);
        process.exit(0);
    }

    const created = await Order.create(orderPayload);
    console.log(`✅ Order saved to DB! _id: ${created._id}`);
    console.log(`   Status: PENDING_SHIPPING (will appear in Schedule Order wizard)`);

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
