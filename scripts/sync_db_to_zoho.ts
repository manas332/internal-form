/**
 * sync_db_to_zoho.ts
 *
 * Maps data from MongoDB to Zoho Billing for a single invoice.
 * Handles all Zoho invoice states: draft, open, paid, overdue, void, partially_paid.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  HOW IT WORKS                                                    │
 * │                                                                  │
 * │  1. Reads the order from MongoDB by orderId                      │
 * │  2. Fetches the matching Zoho invoice                            │
 * │  3. Checks the Zoho invoice status                               │
 * │  4. Applies the appropriate update strategy:                     │
 * │                                                                  │
 * │     DRAFT  → Update line items & fields directly via PUT         │
 * │     OPEN   → Void → Re-create invoice with DB data              │
 * │     PAID   → Skip (warn user — refund needed first)              │
 * │     OVERDUE→ Same as OPEN (void + re-create)                     │
 * │     VOID   → Re-create invoice with DB data                      │
 * │     PARTIALLY_PAID → Skip (warn user)                            │
 * │     NOT FOUND → Create new invoice from DB data                  │
 * │                                                                  │
 * │  5. Optionally converts new invoice to Open & records payment    │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   npx tsx scripts/sync_db_to_zoho.ts                  # dry-run (default)
 *   npx tsx scripts/sync_db_to_zoho.ts --write          # actually push to Zoho
 *   npx tsx scripts/sync_db_to_zoho.ts --write --pay    # push + mark as paid
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '../.env.local' });

// ════════════════════════════════════════════════════════════════
// ██  CONFIGURE THIS — Set the invoice/order ID to sync below  ██
// ════════════════════════════════════════════════════════════════

const TARGET_ORDER_ID = 'INV-000321';  // ← Change this to your invoice number

// ════════════════════════════════════════════════════════════════



// ── CLI Flags ───────────────────────────────────────────────────
const argv = process.argv.slice(2);
const DRY_RUN = !argv.includes('--write');
const AUTO_PAY = argv.includes('--pay');

// ── Console Colors ──────────────────────────────────────────────
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red    = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const magenta= (s: string) => `\x1b[35m${s}\x1b[0m`;

// ── Timezone Helper ─────────────────────────────────────────────
function getISTDateString(): string {
    const date = new Date();
    const istDate = new Date(date.getTime() + (330 * 60000));
    return istDate.toISOString().split('T')[0];
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
    // if (TARGET_ORDER_ID === 'INV-000XXX') {
    //     console.error(red('\n❌ Please set TARGET_ORDER_ID in the script before running.\n'));
    //     console.error('   Open scripts/sync_db_to_zoho.ts and change the value on line ~43.');
    //     process.exit(1);
    // }

    console.log(bold(`\n🔄 Sync DB → Zoho: ${cyan(TARGET_ORDER_ID)}`));
    console.log(`   Mode: ${DRY_RUN ? yellow('DRY RUN (no changes)') : red('WRITE MODE')}${AUTO_PAY ? ' + ' + magenta('AUTO PAY') : ''}\n`);

    // Dynamic imports (dotenv must load first)
    const [{ default: connectDB }, { default: Order }, zoho] = await Promise.all([
        import('../src/lib/mongodb'),
        import('../src/models/Order'),
        import('../src/lib/zoho'),
    ]);

    // ── Step 1: Fetch from Database ─────────────────────────────
    console.log(dim('Connecting to MongoDB...'));
    await connectDB();

    const dbOrder = await Order.findOne({ orderId: TARGET_ORDER_ID }).lean() as Record<string, any> | null;

    if (!dbOrder) {
        console.error(red(`\n❌ Order "${TARGET_ORDER_ID}" not found in MongoDB.`));
        console.error('   Cannot sync to Zoho without DB data.');
        process.exit(1);
    }

    console.log(green('✅ Found order in Database'));
    console.log(`   _id:            ${dbOrder._id}`);
    console.log(`   zohoInvoiceId:  ${dbOrder.zohoInvoiceId || dim('(none)')}`);
    console.log(`   invoiceTotal:   ₹${dbOrder.invoiceTotal ?? 'N/A'}`);
    console.log(`   items:          ${dbOrder.invoiceItems?.length ?? 0}`);
    console.log(`   salesperson:    ${dbOrder.salespersonName || 'N/A'}`);
    console.log(`   paymentMode:    ${dbOrder.paymentMode || 'N/A'}`);
    console.log(`   status:         ${dbOrder.status}`);

    // ── Step 2: Fetch from Zoho ─────────────────────────────────
    console.log(dim('\nFetching from Zoho Billing...'));

    let zohoInvoice: Record<string, any> | null = null;
    let zohoStatus = '';

    // Try by Zoho ID first
    if (dbOrder.zohoInvoiceId) {
        try {
            const res = await zoho.getInvoice(dbOrder.zohoInvoiceId);
            if (res.status === 200 && res.data?.invoice) {
                zohoInvoice = res.data.invoice;
            }
        } catch (err) {
            console.warn(yellow('  ⚠ Failed to fetch by zohoInvoiceId, trying by invoice_number...'));
        }
    }

    // Fallback: search by invoice_number
    if (!zohoInvoice) {
        const token = await zoho.getAccessToken();
        const orgId = process.env.ZOHO_ORG_ID!;
        const searchRes = await fetch(
            `https://www.zohoapis.in/billing/v1/invoices?invoice_number=${encodeURIComponent(TARGET_ORDER_ID)}`,
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

        if (invoices.length > 0) {
            const fullRes = await zoho.getInvoice(invoices[0].invoice_id);
            if (fullRes.status === 200 && fullRes.data?.invoice) {
                zohoInvoice = fullRes.data.invoice;
            }
        }
    }

    if (zohoInvoice) {
        zohoStatus = zohoInvoice.status;
        console.log(green('✅ Found in Zoho'));
        console.log(`   invoice_id:     ${zohoInvoice.invoice_id}`);
        console.log(`   invoice_number: ${zohoInvoice.invoice_number}`);
        console.log(`   status:         ${magenta(zohoStatus)}`);
        console.log(`   total:          ₹${zohoInvoice.total}`);
        console.log(`   balance:        ₹${zohoInvoice.balance}`);
        console.log(`   customer_id:    ${zohoInvoice.customer_id}`);
        console.log(`   items:          ${zohoInvoice.invoice_items?.length ?? 0}`);
    } else {
        console.log(yellow('⚠ Invoice NOT found in Zoho — will create new.'));
        zohoStatus = 'NOT_FOUND';
    }

    // ── Step 2b: Fetch tax rates from Zoho ─────────────────────
    // Build a tax_id → percentage map so we can back-calculate
    // even when there's no existing Zoho invoice to read from.
    const taxMap = new Map<string, number>();
    try {
        const taxRes = await zoho.fetchTaxes();
        const taxes: any[] = taxRes.data || [];
        for (const t of taxes) {
            if (t.tax_id && t.tax_percentage !== undefined) {
                taxMap.set(t.tax_id, Number(t.tax_percentage));
            }
        }
        console.log(dim(`   Loaded ${taxMap.size} tax rates from Zoho.`));
    } catch (err) {
        console.warn(yellow('   ⚠ Could not fetch tax rates from Zoho. Tax back-calculation may be inaccurate.'));
    }

    // ── Step 3: Build Zoho payload from DB data ─────────────────
    console.log(bold('\n━━━ Building Zoho Payload from DB ━━━'));

    const dbItems: any[] = dbOrder.invoiceItems || [];
    const zohoItems: any[] = zohoInvoice?.invoice_items || [];

    // Build a map of Zoho items by item_id to get actual tax_percentage
    // (DB's tax_percentage is often 0 even when tax_id is set)
    const zohoItemMap = new Map<string, any>();
    for (const zi of zohoItems) {
        if (zi.item_id) zohoItemMap.set(zi.item_id, zi);
    }

    // Map DB items → Zoho line_items format
    // DB stores tax-INCLUDED final_price. Zoho expects tax-EXCLUDED rate.
    // We use the ACTUAL tax% from Zoho's existing invoice to back-calculate.
    //   e.g. final_price=270, tax=3% → rate = 270 / 1.03 = 262.14
    const zohoLineItems = dbItems.map((item: any, idx: number) => {
        const qty = Number(item.quantity || 1);
        const dbFinalPrice = Number(item.final_price || 0);

        // Get tax% from: Zoho invoice item (best) → tax map (fallback) → DB (last resort)
        const matchingZohoItem = zohoItemMap.get(item.item_id) || zohoItems[idx];
        const taxPct = Number(
            matchingZohoItem?.tax_percentage
            || (item.tax_id && taxMap.get(item.tax_id))
            || item.tax_percentage
            || 0
        );
        const taxMultiplier = 1 + (taxPct / 100);

        // Back-calculate tax-excluded per-unit rate from DB's tax-included final_price
        let rateExclTax: number;
        if (dbFinalPrice > 0) {
            // final_price is tax-included total for this line
            // tax-excluded rate = final_price / (1 + tax%) / quantity
            rateExclTax = Number((dbFinalPrice / taxMultiplier / qty).toFixed(2));
        } else {
            // Fallback to rate field if final_price is missing
            const dbRate = Number(item.rate || 0);
            rateExclTax = taxMultiplier > 1
                ? Number((dbRate / taxMultiplier).toFixed(2))
                : dbRate;
        }

        // NOTE: Do NOT send item_id — Zoho overrides our custom rate with
        // the catalog price when item_id is present. Without it, Zoho
        // uses the rate we specify.
        const lineItem: Record<string, any> = {
            name: item.name,
            description: item.description || '',
            quantity: qty,
            rate: rateExclTax,       // Zoho Books field name
            price: rateExclTax,      // Zoho Billing/Subscriptions field name
            hsn_or_sac: item.hsn_or_sac || '',
        };
        if (item.tax_id) {
            lineItem.tax_id = item.tax_id;
        }
        console.log(`   [${idx}] ${item.name} × ${qty}`);
        console.log(`          DB final_price (tax-incl): ₹${dbFinalPrice}`);
        console.log(`          Zoho rate (tax-excl): ₹${rateExclTax}  (tax: ${taxPct}%, multiplier: ${taxMultiplier})`);
        console.log(`          Expected Zoho total: ₹${(rateExclTax * qty * taxMultiplier).toFixed(2)}`);
        return lineItem;
    });

    // ── Step 4: Execute based on status ─────────────────────────
    console.log(bold(`\n━━━ Strategy for status: ${magenta(zohoStatus)} ━━━\n`));

    switch (zohoStatus) {
        // ─── DRAFT: Delete → Recreate with same invoice_number & date ──
        // Subscription-linked invoices have can_edit_items=false and block
        // all item modifications (PUT, DELETE lineitem, ADD lineitem).
        // Only option: delete the draft and create a new standalone invoice,
        // preserving the original invoice_number and invoice_date.
        case 'draft': {
            console.log(yellow('📝 DRAFT — Delete & recreate (subscription-linked, items locked).\n'));
            console.log('   Step 1: Delete draft invoice');
            console.log('   Step 2: Create new invoice with same number/date + correct rates');
            if (AUTO_PAY) console.log('   Step 3: Convert to Open + Record payment');

            // Preserve original invoice metadata
            const origNumber = zohoInvoice!.invoice_number;
            const origDate = zohoInvoice!.invoice_date || zohoInvoice!.date;
            const origCustomerId = zohoInvoice!.customer_id;

            if (DRY_RUN) {
                console.log(yellow('\n🔍 DRY RUN — Would:'));
                console.log(`   1. DELETE  https://www.zohoapis.in/billing/v1/invoices/${zohoInvoice!.invoice_id}`);
                console.log(`   2. POST    https://www.zohoapis.in/billing/v1/invoices`);
                console.log(`   Preserved: invoice_number=${origNumber}, invoice_date=${origDate}`);
                console.log(`   Create payload:`);
                const previewPayload: Record<string, any> = {
                    customer_id: origCustomerId,
                    invoice_number: origNumber,
                    date: origDate,
                    invoice_items: zohoLineItems,
                    is_round_off_applied: true,
                };
                if (dbOrder.salespersonName) previewPayload.salesperson_name = dbOrder.salespersonName;
                console.log(JSON.stringify(previewPayload, null, 2));
                if (AUTO_PAY) console.log(`   3. Mark as paid (${dbOrder.paymentMode})`);
            } else {
                // Step 1: Delete the draft
                console.log(dim('\nStep 1: Deleting draft invoice...'));
                const delRes = await zoho.deleteInvoice(zohoInvoice!.invoice_id);
                if (delRes.status !== 200 && delRes.status !== 201) {
                    console.error(red(`❌ Failed to delete draft: ${JSON.stringify(delRes.data)}`));
                    console.error(red('   Cannot proceed. Aborting.'));
                    process.exit(1);
                }
                console.log(green(`✅ Draft deleted (${zohoInvoice!.invoice_id}).`));

                // Step 2: Recreate with same invoice_number and date
                console.log(dim('\nStep 2: Creating new invoice...'));
                const createPayload: Record<string, any> = {
                    customer_id: origCustomerId,
                    invoice_number: origNumber,
                    date: origDate,
                    invoice_items: zohoLineItems,
                    is_round_off_applied: true,
                };
                if (dbOrder.salespersonName) {
                    createPayload.salesperson_name = dbOrder.salespersonName;
                }

                // Use direct fetch with ignore_auto_number_generation to preserve original invoice number
                const token = await zoho.getAccessToken();
                const orgId = process.env.ZOHO_ORG_ID!;
                const createRes = await fetch(
                    `https://www.zohoapis.in/billing/v1/invoices?ignore_auto_number_generation=true`,
                    {
                        method: 'POST',
                        headers: {
                            Authorization: `Zoho-oauthtoken ${token}`,
                            'X-com-zoho-subscriptions-organizationid': orgId,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(createPayload),
                    }
                );
                const createData = await createRes.json();
                if (!createRes.ok) {
                    console.error(red(`❌ Failed to create invoice: ${JSON.stringify(createData)}`));
                    return;
                }

                const newInv = createData.invoice;
                console.log(green('✅ Invoice created!'));
                console.log(`   invoice_id:     ${newInv.invoice_id}`);
                console.log(`   invoice_number: ${newInv.invoice_number}`);
                console.log(`   invoice_date:   ${newInv.date || newInv.invoice_date}`);
                console.log(`   status:         ${newInv.status}`);
                console.log(`   total:          ₹${newInv.total}`);
                for (const it of newInv.invoice_items || []) {
                    console.log(`     • ${it.name} — rate: ₹${it.price}, qty: ${it.quantity}, total: ₹${it.item_total}`);
                }

                // Update DB with new Zoho invoice ID
                await Order.updateOne(
                    { _id: dbOrder._id },
                    { $set: { zohoInvoiceId: newInv.invoice_id } }
                );
                console.log(green(`   Updated DB zohoInvoiceId → ${newInv.invoice_id}`));

                // Auto-pay if requested
                if (AUTO_PAY) {
                    await convertAndPay(zoho, newInv, dbOrder);
                }
            }
            break;
        }

        // ─── OPEN / OVERDUE: Void → Re-create ──────────────────
        case 'open':
        case 'overdue': {
            console.log(yellow(`📋 ${zohoStatus.toUpperCase()} — Must void and re-create.\n`));
            console.log('   Step 1: Void current invoice');
            console.log('   Step 2: Create new invoice with DB data');
            if (AUTO_PAY) console.log('   Step 3: Convert to Open + Record payment');

            if (DRY_RUN) {
                console.log(yellow('\n🔍 DRY RUN — Would:'));
                console.log(`   1. Void invoice ${zohoInvoice!.invoice_id}`);
                console.log(`   2. Create new invoice with ${zohoLineItems.length} items`);
                if (AUTO_PAY) console.log(`   3. Mark as paid (${dbOrder.paymentMode})`);
            } else {
                // Step 1: Void
                console.log(dim('\nVoiding current invoice...'));
                const voidRes = await zoho.voidInvoice(zohoInvoice!.invoice_id);
                if (voidRes.status !== 200 && voidRes.status !== 201) {
                    console.error(red(`❌ Failed to void: ${JSON.stringify(voidRes.data)}`));
                    console.error(red('   Cannot proceed. Aborting.'));
                    process.exit(1);
                }
                console.log(green('✅ Invoice voided.'));

                // Step 2: Re-create
                await createInvoiceFromDB(zoho, Order, dbOrder, zohoLineItems, zohoInvoice!.customer_id);
            }
            break;
        }

        // ─── PAID: Cannot modify — warn user ────────────────────
        case 'paid': {
            console.log(red('💰 PAID — Cannot modify a paid invoice.\n'));
            console.log('   Options:');
            console.log('   1. Issue a credit note for the difference');
            console.log('   2. Delete the payment in Zoho → status reverts to Open → re-run this script');
            console.log('   3. Void the invoice manually in Zoho → re-run this script');
            console.log(dim('\n   No changes were made.'));
            break;
        }

        // ─── PARTIALLY_PAID: Cannot modify safely ───────────────
        case 'partially_paid': {
            console.log(red('💳 PARTIALLY PAID — Cannot safely modify.\n'));
            console.log('   A partial payment exists. To sync:');
            console.log('   1. Delete the payment(s) in Zoho → status reverts to Open');
            console.log('   2. Re-run this script');
            console.log(dim('\n   No changes were made.'));
            break;
        }

        // ─── VOID: Re-create from DB data ───────────────────────
        case 'void': {
            console.log(yellow('🚫 VOID — Invoice was voided. Creating new invoice from DB data.\n'));

            if (DRY_RUN) {
                console.log(yellow('🔍 DRY RUN — Would create new invoice with:'));
                console.log(`   Items: ${zohoLineItems.length}`);
                console.log(`   Customer: ${zohoInvoice!.customer_id}`);
                if (AUTO_PAY) console.log(`   + Mark as paid (${dbOrder.paymentMode})`);
            } else {
                await createInvoiceFromDB(zoho, Order, dbOrder, zohoLineItems, zohoInvoice!.customer_id);
            }
            break;
        }

        // ─── NOT_FOUND: Create brand new ────────────────────────
        case 'NOT_FOUND': {
            console.log(yellow('🆕 NOT FOUND — Creating new invoice in Zoho from DB data.\n'));

            // We need a customer_id — try to find by name
            const customerName = dbOrder.customerDetails?.customer_name;
            if (!customerName) {
                console.error(red('❌ No customer name in DB. Cannot create invoice without a customer.'));
                process.exit(1);
            }

            let customerId = '';
            console.log(dim(`Searching Zoho for customer: "${customerName}"...`));
            const custRes = await zoho.searchCustomers(customerName);
            const customers = custRes.data?.customers || [];

            if (customers.length > 0) {
                customerId = customers[0].customer_id;
                console.log(green(`✅ Found customer: ${customers[0].display_name} (${customerId})`));
            } else {
                console.log(yellow('⚠ Customer not found in Zoho. Creating new customer...'));

                if (DRY_RUN) {
                    console.log(yellow('🔍 DRY RUN — Would create customer + invoice.'));
                    break;
                }

                const newCust = await zoho.createCustomer({
                    display_name: customerName,
                    email: dbOrder.customerDetails?.email || '',
                    phone: dbOrder.customerDetails?.phone || '',
                    billing_address: {
                        street: dbOrder.customerDetails?.address || '',
                        city: dbOrder.customerDetails?.city || '',
                        state: dbOrder.customerDetails?.state || '',
                        country: dbOrder.customerDetails?.country || 'India',
                        zip: dbOrder.customerDetails?.pincode || '',
                    },
                });

                if (newCust.status !== 201 && newCust.status !== 200) {
                    console.error(red(`❌ Failed to create customer: ${JSON.stringify(newCust.data)}`));
                    process.exit(1);
                }
                customerId = newCust.data.customer?.customer_id;
                console.log(green(`✅ Customer created: ${customerId}`));
            }

            if (DRY_RUN) {
                console.log(yellow('\n🔍 DRY RUN — Would create invoice with:'));
                console.log(`   Customer: ${customerId}`);
                console.log(`   Items: ${zohoLineItems.length}`);
                if (AUTO_PAY) console.log(`   + Mark as paid (${dbOrder.paymentMode})`);
            } else {
                await createInvoiceFromDB(zoho, Order, dbOrder, zohoLineItems, customerId);
            }
            break;
        }

        // ─── UNKNOWN STATUS ─────────────────────────────────────
        default: {
            console.log(red(`❓ Unknown Zoho status: "${zohoStatus}"`));
            console.log('   Not sure how to handle. No changes made.');
            break;
        }
    }

    console.log(dim('\n─────────────────────────────────────────'));
    console.log('Done.\n');
    process.exit(0);
}

// ── Helper: Create new invoice from DB data ─────────────────────
async function createInvoiceFromDB(
    zoho: any,
    Order: any,
    dbOrder: Record<string, any>,
    zohoLineItems: Record<string, any>[],
    customerId: string,
) {
    console.log(dim('\nCreating new invoice in Zoho...'));

    const invoicePayload: Record<string, any> = {
        customer_id: customerId,
        invoice_number: dbOrder.orderId,
        invoice_items: zohoLineItems,
        is_round_off_applied: true,
        notes: 'Re-created from MongoDB data via sync script.',
    };

    if (dbOrder.salespersonName) {
        invoicePayload.salesperson_name = dbOrder.salespersonName;
    }

    // Use direct fetch with ignore_auto_number_generation to preserve invoice number
    const token = await zoho.getAccessToken();
    const orgId = process.env.ZOHO_ORG_ID!;
    const createRes = await fetch(
        `https://www.zohoapis.in/billing/v1/invoices?ignore_auto_number_generation=true`,
        {
            method: 'POST',
            headers: {
                Authorization: `Zoho-oauthtoken ${token}`,
                'X-com-zoho-subscriptions-organizationid': orgId,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(invoicePayload),
        }
    );
    const createData = await createRes.json();

    if (!createRes.ok) {
        console.error(red(`❌ Failed to create invoice: ${JSON.stringify(createData)}`));
        return;
    }

    const newInvoice = createData.invoice;
    console.log(green(`✅ Invoice created!`));
    console.log(`   invoice_id:     ${newInvoice.invoice_id}`);
    console.log(`   invoice_number: ${newInvoice.invoice_number}`);
    console.log(`   status:         ${newInvoice.status}`);
    console.log(`   total:          ₹${newInvoice.total}`);

    // Update DB with new Zoho invoice ID
    await Order.updateOne(
        { _id: dbOrder._id },
        { $set: { zohoInvoiceId: newInvoice.invoice_id } }
    );
    console.log(green(`   Updated DB zohoInvoiceId → ${newInvoice.invoice_id}`));

    // Auto-pay if requested
    if (AUTO_PAY) {
        await convertAndPay(zoho, newInvoice, dbOrder);
    }
}

// ── Helper: Convert draft→open and record payment ───────────────
async function convertAndPay(
    zoho: any,
    invoice: Record<string, any>,
    dbOrder: Record<string, any>,
) {
    const invoiceId = invoice.invoice_id;
    const currentStatus = invoice.status;
    const paymentMode = dbOrder.paymentMode || 'Prepaid';
    const total = Number(invoice.total);

    console.log(dim(`\n💳 Auto-pay: ${invoiceId} (${paymentMode})...`));

    // Convert to open if draft
    if (currentStatus === 'draft') {
        console.log(dim('   Converting Draft → Open...'));
        const token = await zoho.getAccessToken();
        const orgId = process.env.ZOHO_ORG_ID!;

        const openRes = await fetch(
            `https://www.zohoapis.in/billing/v1/invoices/${invoiceId}/converttoopen`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Zoho-oauthtoken ${token}`,
                    'X-com-zoho-subscriptions-organizationid': orgId,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!openRes.ok) {
            const text = await openRes.text();
            console.error(red(`   ❌ Failed to open: ${text}`));
            return;
        }
        console.log(green('   ✅ Converted to Open.'));
    }

    // Record payment
    console.log(dim('   Recording payment...'));
    const zohoPaymentMode = paymentMode === 'COD' ? 'others' : 'banktransfer';

    const payRes = await zoho.createPayment({
        customer_id: invoice.customer_id,
        payment_mode: zohoPaymentMode,
        amount: total,
        date: getISTDateString(),
        invoice_id: invoiceId,
        reference_number: 'Sync Script - DB to Zoho',
        description: `Payment recorded via sync_db_to_zoho.ts (${paymentMode})`,
    });

    if (payRes.status === 200 || payRes.status === 201) {
        console.log(green(`   ✅ Payment recorded! ₹${total} via ${zohoPaymentMode}`));
        console.log(`      Payment ID: ${payRes.data?.payment?.payment_id || 'N/A'}`);
    } else {
        console.error(red(`   ❌ Payment failed: ${JSON.stringify(payRes.data)}`));
    }
}



main().catch(err => {
    console.error(red('Fatal error:'), err);
    process.exit(1);
});
