/**
 * compare_invoice.ts
 *
 * Usage:
 *   npx tsx scripts/compare_invoice.ts <orderId>
 *   npx tsx scripts/compare_invoice.ts <orderId> --sync    # also saves missing order to DB
 *
 * Examples:
 *   npx tsx scripts/compare_invoice.ts INV-00123
 *   npx tsx scripts/compare_invoice.ts INV-00123 --sync
 *
 * What it does:
 *   1. Looks up the order in MongoDB by orderId (invoice number)
 *   2. Searches Zoho Billing for the invoice by invoice_number
 *   3. Compares the two records field-by-field
 *   4. If --sync flag is passed and the order is missing from DB, inserts it
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '../.env.local' });

// ── Helpers ──────────────────────────────────────────────────────────
function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string) { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s: string) { return `\x1b[36m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
    const args = process.argv.slice(2);
    const orderId = args.find(a => !a.startsWith('--'));
    const doSync = args.includes('--sync');

    if (!orderId) {
        console.error(red('Usage: npx tsx scripts/compare_invoice.ts <orderId> [--sync]'));
        process.exit(1);
    }

    console.log(bold(`\n🔍 Comparing Invoice: ${cyan(orderId)}\n`));

    // Dynamic imports (so dotenv is loaded first)
    const [{ default: connectDB }, { default: Order }, zoho] = await Promise.all([
        import('../src/lib/mongodb'),
        import('../src/models/Order'),
        import('../src/lib/zoho'),
    ]);

    // ── Step 1: Fetch from Database ──────────────────────────────────
    console.log(dim('Connecting to MongoDB...'));
    await connectDB();

    const dbOrder = await Order.findOne({ orderId }).lean() as Record<string, any> | null;

    if (dbOrder) {
        console.log(green(`✅ Found in Database`));
        console.log(`   _id:            ${dbOrder._id}`);
        console.log(`   zohoInvoiceId:  ${dbOrder.zohoInvoiceId}`);
        console.log(`   orderId:        ${dbOrder.orderId}`);
        console.log(`   invoiceTotal:   ${dbOrder.invoiceTotal ?? 'N/A'}`);
        console.log(`   invoiceItems:   ${dbOrder.invoiceItems?.length ?? 0} items`);
        console.log(`   salesperson:    ${dbOrder.salespersonName || 'N/A'}`);
        console.log(`   status:         ${dbOrder.status}`);
        console.log(`   paymentMode:    ${dbOrder.paymentMode}`);
        console.log(`   createdAt:      ${dbOrder.createdAt}`);
    } else {
        console.log(red(`❌ NOT found in Database`));
    }

    // ── Step 2: Fetch from Zoho ──────────────────────────────────────
    console.log(dim('\nFetching from Zoho Billing...'));

    let zohoInvoice: Record<string, any> | null = null;

    // If we have the Zoho ID from DB, use it directly
    if (dbOrder?.zohoInvoiceId) {
        const res = await zoho.getInvoice(dbOrder.zohoInvoiceId);
        if (res.status === 200 && res.data?.invoice) {
            zohoInvoice = res.data.invoice;
        }
    }

    // Otherwise, search by invoice_number
    if (!zohoInvoice) {
        console.log(dim('Searching Zoho by invoice_number...'));
        const token = await zoho.getAccessToken();
        const orgId = process.env.ZOHO_ORG_ID;
        const searchRes = await fetch(
            `https://www.zohoapis.in/billing/v1/invoices?invoice_number=${encodeURIComponent(orderId)}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Zoho-oauthtoken ${token}`,
                    'X-com-zoho-subscriptions-organizationid': orgId!,
                    'Content-Type': 'application/json',
                },
            }
        );
        const searchData = await searchRes.json();
        const invoices: any[] = searchData.invoices || [];

        if (invoices.length > 0) {
            // Fetch full invoice details
            const fullRes = await zoho.getInvoice(invoices[0].invoice_id);
            if (fullRes.status === 200 && fullRes.data?.invoice) {
                zohoInvoice = fullRes.data.invoice;
            }
        }
    }

    if (zohoInvoice) {
        console.log(green(`✅ Found in Zoho`));
        console.log(`   invoice_id:     ${zohoInvoice.invoice_id}`);
        console.log(`   invoice_number: ${zohoInvoice.invoice_number}`);
        console.log(`   status:         ${zohoInvoice.status}`);
        console.log(`   total:          ₹${zohoInvoice.total}`);
        console.log(`   balance:        ₹${zohoInvoice.balance}`);
        console.log(`   date:           ${zohoInvoice.date}`);
        console.log(`   customer_name:  ${zohoInvoice.customer_name}`);
        console.log(`   salesperson:    ${zohoInvoice.salesperson_name || 'N/A'}`);
        console.log(`   items:          ${zohoInvoice.invoice_items?.length ?? 0} items`);
    } else {
        console.log(red(`❌ NOT found in Zoho`));
        console.log(red('\nNothing more to compare.'));
        process.exit(1);
    }

    // ── Step 3: Compare ──────────────────────────────────────────────
    console.log(bold('\n━━━ Comparison ━━━'));

    if (!dbOrder && zohoInvoice) {
        console.log(red('\n⚠️  Invoice exists in Zoho but is MISSING from the Database!'));
        console.log('   This is the sync gap. The order was created in Zoho but');
        console.log('   the MongoDB save failed (or was never attempted).\n');

        // Show the Zoho line items so user can verify
        console.log(bold('Zoho Line Items:'));
        for (const item of zohoInvoice.invoice_items || []) {
            console.log(`   • ${item.name} × ${item.quantity} @ ₹${item.rate} = ₹${item.item_total} (+tax ₹${item.tax_amount ?? 0})`);
        }

        if (doSync) {
            console.log(yellow('\n🔄 --sync flag detected. Inserting into database...'));

            // Map Zoho items to our schema
            const mappedItems = (zohoInvoice.invoice_items || []).map((it: any) => ({
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
                cost_price: 0, // Default — Zoho doesn't store cost_price
            }));

            // Extract customer details from Zoho invoice
            const shipping = zohoInvoice.shipping_address || {};
            const billing = zohoInvoice.billing_address || {};
            const addr = shipping.street || billing.street || '';
            const city = shipping.city || billing.city || '';
            const state = shipping.state || billing.state || '';
            const country = shipping.country || billing.country || 'India';
            const pincode = shipping.zip || billing.zip || '';

            // Determine payment mode from balance
            const paymentMode = zohoInvoice.balance === 0 ? 'Prepaid' : 'COD';

            const orderPayload = {
                zohoInvoiceId: zohoInvoice.invoice_id,
                orderId: zohoInvoice.invoice_number,
                customerDetails: {
                    customer_name: zohoInvoice.customer_name || '',
                    email: zohoInvoice.email || '',
                    phone: '',
                    country_code: '+91',
                    address: addr,
                    city,
                    state,
                    country,
                    pincode,
                },
                invoiceItems: mappedItems,
                invoiceTotal: Number(zohoInvoice.total) || 0,
                salespersonName: zohoInvoice.salesperson_name || '',
                paymentMode,
                status: 'PENDING_SHIPPING',
            };

            try {
                const created = await Order.create(orderPayload);
                console.log(green(`✅ Order synced to database! _id: ${created._id}`));
            } catch (err: any) {
                console.error(red(`❌ Failed to sync: ${err.message}`));
                if (err.errors) {
                    // Mongoose validation errors — show which fields failed
                    for (const [field, error] of Object.entries(err.errors)) {
                        console.error(red(`   → ${field}: ${(error as any).message}`));
                    }
                }
            }
        } else {
            console.log(yellow('\n💡 Run with --sync to insert this invoice into the database:'));
            console.log(cyan(`   npx tsx scripts/compare_invoice.ts ${orderId} --sync`));
        }
    } else if (dbOrder && zohoInvoice) {
        console.log(green('\n✅ Invoice exists in both Zoho and Database\n'));

        // Field-by-field comparison
        const mismatches: string[] = [];

        const compare = (label: string, dbVal: any, zohoVal: any) => {
            const dbStr = String(dbVal ?? '');
            const zohoStr = String(zohoVal ?? '');
            if (dbStr === zohoStr) {
                console.log(`   ${green('✓')} ${label}: ${dbStr}`);
            } else {
                console.log(`   ${red('✗')} ${label}`);
                console.log(`      DB:   ${dbStr}`);
                console.log(`      Zoho: ${zohoStr}`);
                mismatches.push(label);
            }
        };

        compare('Invoice ID', dbOrder.zohoInvoiceId, zohoInvoice.invoice_id);
        compare('Invoice Total', dbOrder.invoiceTotal, zohoInvoice.total);
        compare('Salesperson', dbOrder.salespersonName, zohoInvoice.salesperson_name);

        // Compare item counts
        const dbItemCount = dbOrder.invoiceItems?.length ?? 0;
        const zohoItemCount = zohoInvoice.invoice_items?.length ?? 0;
        compare('Item Count', dbItemCount, zohoItemCount);

        // Compare individual items
        if (dbItemCount > 0 || zohoItemCount > 0) {
            console.log(bold('\n   Line Item Comparison:'));
            const maxItems = Math.max(dbItemCount, zohoItemCount);
            for (let i = 0; i < maxItems; i++) {
                const dbItem = dbOrder.invoiceItems?.[i];
                const zohoItem = zohoInvoice.invoice_items?.[i];

                if (!dbItem && zohoItem) {
                    console.log(red(`   [${i}] MISSING in DB: ${zohoItem.name} × ${zohoItem.quantity}`));
                    mismatches.push(`Item[${i}]`);
                } else if (dbItem && !zohoItem) {
                    console.log(yellow(`   [${i}] EXTRA in DB: ${dbItem.name} × ${dbItem.quantity}`));
                    mismatches.push(`Item[${i}]`);
                } else if (dbItem && zohoItem) {
                    const nameMatch = (dbItem.name || '') === (zohoItem.name || '');
                    const qtyMatch = Number(dbItem.quantity) === Number(zohoItem.quantity);
                    const totalMatch = Math.abs(Number(dbItem.item_total || 0) - Number(zohoItem.item_total || 0)) < 0.01;
                    const symbol = (nameMatch && qtyMatch && totalMatch) ? green('✓') : red('✗');
                    console.log(`   ${symbol} [${i}] ${dbItem.name || zohoItem.name}   qty: ${dbItem.quantity}/${zohoItem.quantity}   total: ${dbItem.item_total}/${zohoItem.item_total}`);
                    if (!nameMatch || !qtyMatch || !totalMatch) {
                        mismatches.push(`Item[${i}]`);
                    }
                }
            }
        }

        if (mismatches.length === 0) {
            console.log(green('\n🎉 All fields match! No discrepancies.\n'));
        } else {
            console.log(yellow(`\n⚠️  ${mismatches.length} mismatch(es) found: ${mismatches.join(', ')}\n`));
        }
    }

    process.exit(0);
}

main().catch(err => {
    console.error(red('Fatal error:'), err);
    process.exit(1);
});
