/**
 * sync_db_to_zoho.ts
 *
 * Modular, Production-Grade script to map data from MongoDB to Zoho Billing for a single invoice.
 * Features a Transaction-like "Rename-Create-Cleanup" strategy to prevent data loss.
 *
 * Usage:
 *   npx tsx scripts/sync_db_to_zoho.ts [INVOICE_NUMBER]           # dry-run
 *   npx tsx scripts/sync_db_to_zoho.ts [INVOICE_NUMBER] --write   # actually push
 *   npx tsx scripts/sync_db_to_zoho.ts [INVOICE_NUMBER] --write --pay
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '../.env.local' });
import mongoose from 'mongoose';

// ── Console Colors ──────────────────────────────────────────────
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

// ── CLI Configuration ───────────────────────────────────────────
const argv = process.argv.slice(2);
const DRY_RUN = !argv.includes('--write');
const AUTO_PAY = argv.includes('--pay');
const invoiceArg = argv.find(arg => !arg.startsWith('--'));
const TARGET_ORDER_ID = invoiceArg || 'INV-000270';

// ── Main Entry ──────────────────────────────────────────────────
async function main() {
    console.log(bold(`\n🔄 Sync DB → Zoho: ${cyan(TARGET_ORDER_ID)}`));
    console.log(`   Mode: ${DRY_RUN ? yellow('DRY RUN (no changes)') : red('WRITE MODE')}${AUTO_PAY ? ' + ' + magenta('AUTO PAY') : ''}\n`);

    try {
        const deps = await loadDependencies();
        const { dbOrder, Order } = await fetchDbData(deps);
        const { zohoInvoice, zohoStatus, taxMap, taxList } = await fetchZohoData(deps, dbOrder);
        const zohoLineItems = buildZohoPayload(deps, dbOrder, zohoInvoice, taxMap, taxList);

        await syncZoho(deps, dbOrder, Order, zohoInvoice, zohoStatus, zohoLineItems);

        console.log(green('\n✅ Synchronization completed successfully.'));
    } catch (error: any) {
        console.error(red('\n❌ FATAL ERROR DURING SYNC:'));
        console.error(error.stack || error.message || error);
        process.exitCode = 1;
    } finally {
        console.log(dim('\nClosing connections...'));
        try {
            await mongoose.disconnect();
        } catch (e) {
            // Ignore disconnect errors
        }
        console.log(dim('Exiting.'));
        process.exit(); // Force exit
    }
}

// ── Modular Functions ───────────────────────────────────────────

async function loadDependencies() {
    console.log(dim('Loading dependencies...'));
    const [{ default: connectDB }, { default: Order }, zoho, { getCorrectTaxId, isInterstateOrder }] = await Promise.all([
        import('../src/lib/mongodb'),
        import('../src/models/Order'),
        import('../src/lib/zoho'),
        import('../src/lib/tax'),
    ]);
    await connectDB();
    return { Order, zoho, getCorrectTaxId, isInterstateOrder };
}

async function fetchDbData({ Order }: any) {
    console.log(dim('Fetching from MongoDB...'));
    const dbOrder = await Order.findOne({ orderId: TARGET_ORDER_ID }).lean() as Record<string, any> | null;

    if (!dbOrder) {
        throw new Error(`Order "${TARGET_ORDER_ID}" not found in MongoDB.`);
    }

    console.log(green('✅ Found order in Database'));
    console.log(`   zohoInvoiceId:  ${dbOrder.zohoInvoiceId || dim('(none)')}`);
    console.log(`   invoiceTotal:   ₹${dbOrder.invoiceTotal ?? 'N/A'}`);
    console.log(`   status:         ${dbOrder.status}`);
    
    return { dbOrder, Order };
}

async function fetchZohoData({ zoho }: any, dbOrder: any) {
    console.log(dim('\nFetching from Zoho Billing...'));
    let zohoInvoice: Record<string, any> | null = null;

    if (dbOrder.zohoInvoiceId) {
        try {
            const res = await zoho.getInvoice(dbOrder.zohoInvoiceId);
            if (res.status === 200 && res.data?.invoice) zohoInvoice = res.data.invoice;
        } catch (err) {
            console.log(yellow('   ⚠ Failed to fetch by ID, falling back to number...'));
        }
    }

    if (!zohoInvoice) {
        const token = await zoho.getAccessToken();
        const orgId = process.env.ZOHO_ORG_ID!;
        const searchRes = await fetch(
            `https://www.zohoapis.in/billing/v1/invoices?invoice_number=${encodeURIComponent(TARGET_ORDER_ID)}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}`, 'X-com-zoho-subscriptions-organizationid': orgId } }
        );
        const searchData = await searchRes.json();
        if (searchData.invoices?.length > 0) {
            const fullRes = await zoho.getInvoice(searchData.invoices[0].invoice_id);
            if (fullRes.status === 200 && fullRes.data?.invoice) zohoInvoice = fullRes.data.invoice;
        }
    }

    const zohoStatus = zohoInvoice ? zohoInvoice.status : 'NOT_FOUND';
    if (zohoInvoice) {
        console.log(green(`✅ Found in Zoho: ${magenta(zohoStatus)} (ID: ${zohoInvoice.invoice_id})`));
    } else {
        console.log(yellow('⚠ Invoice NOT found in Zoho — will create new.'));
    }

    // Fetch tax rates for back-calculation
    const taxMap = new Map<string, number>();
    let taxList: any[] = [];
    try {
        const taxRes = await zoho.fetchTaxes();
        taxList = taxRes.data || [];
        taxList.forEach((t: any) => {
            if (t.tax_id && t.tax_percentage !== undefined) taxMap.set(t.tax_id, Number(t.tax_percentage));
        });
    } catch (err) {
        console.warn(yellow('   ⚠ Could not fetch tax rates. Calculations may be inaccurate.'));
    }

    return { zohoInvoice, zohoStatus, taxMap, taxList };
}

function buildZohoPayload(deps: any, dbOrder: any, zohoInvoice: any, taxMap: Map<string, number>, taxList: any[]) {
    console.log(bold('\n━━━ Building Payload ━━━'));
    const { getCorrectTaxId, isInterstateOrder } = deps;
    const isInterstate = isInterstateOrder(dbOrder.customerDetails?.state);
    
    const dbItems = dbOrder.invoiceItems || [];
    const zohoItems = zohoInvoice?.invoice_items || [];
    const zohoItemMap = new Map(zohoItems.map((zi: any) => [zi.item_id, zi]));

    return dbItems.map((item: any, idx: number) => {
        const qty = Number(item.quantity || 1);
        const dbFinalPrice = Number(item.final_price || 0);
        
        // Ensure tax_id is robustly calculated from HSN rules if available
        let correctTaxId = 'NO_TAX';
        if (item.hsn_or_sac) {
            correctTaxId = getCorrectTaxId(item.hsn_or_sac, isInterstate);
        } else if (item.tax_id && !['NO_TAX', '0', 'null'].includes(String(item.tax_id))) {
            correctTaxId = item.tax_id; // Fallback to DB tax_id if no HSN match
        }

        // If it's a 0% item (NO_TAX), we MUST pass the actual 0% tax ID to Zoho.
        // Otherwise, Zoho applies the catalog item's default tax (e.g. 3%).
        if (correctTaxId === 'NO_TAX') {
            const zeroTaxes = taxList.filter((t: any) => Number(t.tax_percentage) === 0);
            if (zeroTaxes.length > 0) {
                const bestZero = zeroTaxes.find((t: any) => {
                    const name = String(t.tax_name).toUpperCase();
                    if (isInterstate) return name.includes('IGST');
                    return name.includes('GST0') || name.includes('GROUP');
                });
                correctTaxId = bestZero ? bestZero.tax_id : zeroTaxes[0].tax_id;
            }
        }
        
        const matchingZohoItem = zohoItemMap.get(item.item_id) || zohoItems[idx];
        const taxPct = Number(
            matchingZohoItem?.tax_percentage || (correctTaxId !== 'NO_TAX' && taxMap.get(correctTaxId)) || item.tax_percentage || 0
        );
        const taxMultiplier = 1 + (taxPct / 100);

        // ── CALCULATE TAX-EXCLUSIVE UNIT PRICE ──
        // 1. item_total = tax-exclusive TOTAL for the entire line (unit_price * qty)
        // 2. final_price = tax-inclusive UNIT PRICE
        let rateExclTax = 0;
        if (typeof item.item_total === 'number') {
            rateExclTax = Number((item.item_total / qty).toFixed(2));
        } else if (typeof item.final_price === 'number') {
            rateExclTax = Number((item.final_price / taxMultiplier).toFixed(2));
        } else {
            rateExclTax = Number((Number(item.rate || 0) / (taxMultiplier > 1 ? taxMultiplier : 1)).toFixed(2));
        }

        console.log(`   [${idx}] ${item.name} × ${qty} | Rate: ₹${rateExclTax} (Tax: ${taxPct}%)`);
        
        return {
            name: item.name,
            description: item.description || '',
            quantity: qty,
            rate: rateExclTax,
            price: rateExclTax,
            hsn_or_sac: item.hsn_or_sac || '',
            ...(correctTaxId !== 'NO_TAX' ? { tax_id: correctTaxId } : { tax_id: "" })
        };
    });
}

// ── Core Synchronization Logic ────────────────────────────────────

async function syncZoho(deps: any, dbOrder: any, Order: any, zohoInvoice: any, status: string, lineItems: any[]) {
    console.log(bold(`\n━━━ Strategy: ${magenta(status.toUpperCase())} ━━━\n`));

    switch (status) {
        case 'draft':
        case 'open':
        case 'overdue': {
            await handleTransactionalReplacement(deps, dbOrder, Order, zohoInvoice, lineItems, status);
            break;
        }
        case 'paid':
        case 'partially_paid': {
            console.log(red(`❌ Cannot modify a ${status} invoice. Please void or delete payments in Zoho first.`));
            break;
        }
        case 'void': {
            console.log(yellow('🚫 Invoice is Void. Creating a new replacement.'));
            if (!DRY_RUN) await createInvoiceFromDB(deps, Order, dbOrder, lineItems, zohoInvoice.customer_id, TARGET_ORDER_ID);
            break;
        }
        case 'NOT_FOUND': {
            const customerId = await resolveCustomer(deps.zoho, dbOrder);
            if (!DRY_RUN) await createInvoiceFromDB(deps, Order, dbOrder, lineItems, customerId, TARGET_ORDER_ID);
            break;
        }
        default:
            console.log(red(`❓ Unknown status: ${status}. Aborting.`));
    }
}

// ── Transactional Replacement (Rename -> Create -> Cleanup) ─────

async function handleTransactionalReplacement(deps: any, dbOrder: any, Order: any, oldInvoice: any, lineItems: any[], status: string) {
    const { zoho } = deps;
    const oldInvoiceId = oldInvoice.invoice_id;
    const origNumber = oldInvoice.invoice_number;
    const origDate = oldInvoice.invoice_date || oldInvoice.date;
    const renameSuffix = `-OLD-${Math.floor(Math.random() * 10000)}`;
    const tempNumber = `${origNumber}${renameSuffix}`;

    console.log(dim('Executing Transactional Replacement:'));
    console.log(`   1. Rename old invoice to: ${tempNumber}`);
    console.log(`   2. Create new invoice as: ${origNumber}`);
    console.log(`   3. Cleanup (Delete/Void) old invoice`);

    if (DRY_RUN) {
        console.log(yellow('\n🔍 DRY RUN: Payload for new invoice'));
        console.log(JSON.stringify({ invoice_number: origNumber, customer_id: oldInvoice.customer_id, invoice_items: lineItems.length + ' items' }, null, 2));
        return;
    }

    // Step 1: Rename
    console.log(dim(`\nRenaming old invoice...`));
    const token = await zoho.getAccessToken();
    const orgId = process.env.ZOHO_ORG_ID!;
    const headers = { Authorization: `Zoho-oauthtoken ${token}`, 'X-com-zoho-subscriptions-organizationid': orgId, 'Content-Type': 'application/json' };

    const renameRes = await fetch(`https://www.zohoapis.in/billing/v1/invoices/${oldInvoiceId}?ignore_auto_number_generation=true`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ invoice_number: tempNumber })
    });
    
    if (!renameRes.ok) {
        // If rename fails, we fallback to deleting/voiding first (unsafe but necessary if Zoho blocks rename)
        console.log(yellow(`   ⚠ Rename failed (status ${renameRes.status}). Zoho might block edits on this invoice.`));
        console.log(yellow(`   Falling back to direct Delete/Void -> Create.`));
        
        if (status === 'draft') {
            await zoho.deleteInvoice(oldInvoiceId);
        } else {
            await zoho.voidInvoice(oldInvoiceId);
        }
        await createInvoiceFromDB(deps, Order, dbOrder, lineItems, oldInvoice.customer_id, origNumber, origDate);
        return;
    }
    
    console.log(green(`   ✅ Renamed to ${tempNumber}`));

    // Step 2: Create
    console.log(dim(`Creating new replacement invoice...`));
    let newInvoiceId = null;
    try {
        const createPayload: any = {
            customer_id: oldInvoice.customer_id,
            invoice_number: origNumber,
            date: origDate,
            invoice_items: lineItems,
            is_round_off_applied: true,
            notes: 'Re-created via transaction sync.'
        };
        if (dbOrder.salespersonName) createPayload.salesperson_name = dbOrder.salespersonName;

        const createRes = await fetch(`https://www.zohoapis.in/billing/v1/invoices?ignore_auto_number_generation=true`, {
            method: 'POST',
            headers,
            body: JSON.stringify(createPayload)
        });
        
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(`Zoho Error: ${JSON.stringify(createData)}`);
        
        newInvoiceId = createData.invoice.invoice_id;
        console.log(green(`   ✅ Created successfully (ID: ${newInvoiceId})`));

        // Update DB
        await Order.updateOne({ _id: dbOrder._id }, { $set: { zohoInvoiceId: newInvoiceId } });
        console.log(green(`   ✅ DB updated`));

        if (AUTO_PAY) await convertAndPay(zoho, createData.invoice, dbOrder);

    } catch (err: any) {
        // Step 2 Failed -> Rollback Step 1
        console.error(red(`\n❌ Creation failed! Rolling back rename...`));
        console.error(red(`   Reason: ${err.message}`));
        
        await fetch(`https://www.zohoapis.in/billing/v1/invoices/${oldInvoiceId}?ignore_auto_number_generation=true`, {
            method: 'PUT', headers, body: JSON.stringify({ invoice_number: origNumber })
        });
        
        console.log(green(`   🔄 Rollback complete. Original invoice restored.`));
        throw new Error('Transaction aborted due to creation failure.');
    }

    // Step 3: Cleanup Old
    console.log(dim(`Cleaning up old invoice...`));
    if (status === 'draft') {
        await zoho.deleteInvoice(oldInvoiceId);
        console.log(green(`   ✅ Old Draft Deleted.`));
    } else {
        await zoho.voidInvoice(oldInvoiceId);
        console.log(green(`   ✅ Old Invoice Voided.`));
    }
}

// ── Helpers ─────────────────────────────────────────────────────

async function resolveCustomer(zoho: any, dbOrder: any) {
    const customerName = dbOrder.customerDetails?.customer_name;
    if (!customerName) throw new Error('No customer name in DB. Cannot create invoice.');

    console.log(dim(`Searching Zoho for customer: "${customerName}"...`));
    const custRes = await zoho.searchCustomers(customerName);
    const customers = custRes.data?.customers || [];

    if (customers.length > 0) return customers[0].customer_id;

    if (DRY_RUN) {
        console.log(yellow('🔍 DRY RUN — Would create new customer.'));
        return 'DRY_RUN_CUSTOMER_ID';
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
        throw new Error(`Failed to create customer: ${JSON.stringify(newCust.data)}`);
    }
    return newCust.data.customer.customer_id;
}

async function createInvoiceFromDB(deps: any, Order: any, dbOrder: any, lineItems: any[], customerId: string, invoiceNumber: string, invoiceDate?: string) {
    console.log(dim('\nCreating new invoice directly...'));
    const { zoho } = deps;

    const payload: any = {
        customer_id: customerId,
        invoice_number: invoiceNumber,
        invoice_items: lineItems,
        is_round_off_applied: true,
        notes: 'Created via sync script.',
    };
    if (invoiceDate) payload.date = invoiceDate;
    if (dbOrder.salespersonName) payload.salesperson_name = dbOrder.salespersonName;

    const token = await zoho.getAccessToken();
    const orgId = process.env.ZOHO_ORG_ID!;
    const createRes = await fetch(`https://www.zohoapis.in/billing/v1/invoices?ignore_auto_number_generation=true`, {
        method: 'POST',
        headers: { Authorization: `Zoho-oauthtoken ${token}`, 'X-com-zoho-subscriptions-organizationid': orgId, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(`Failed to create invoice: ${JSON.stringify(createData)}`);

    const newInv = createData.invoice;
    console.log(green(`✅ Invoice created (ID: ${newInv.invoice_id})`));

    await Order.updateOne({ _id: dbOrder._id }, { $set: { zohoInvoiceId: newInv.invoice_id } });
    console.log(green(`   ✅ DB updated with new Zoho Invoice ID (${newInv.invoice_id})`));
    
    if (AUTO_PAY) await convertAndPay(zoho, newInv, dbOrder);
}

async function convertAndPay(zoho: any, invoice: any, dbOrder: any) {
    console.log(dim(`\n💳 Auto-pay (${dbOrder.paymentMode || 'Prepaid'})...`));
    const token = await zoho.getAccessToken();
    const orgId = process.env.ZOHO_ORG_ID!;
    const headers = { Authorization: `Zoho-oauthtoken ${token}`, 'X-com-zoho-subscriptions-organizationid': orgId, 'Content-Type': 'application/json' };

    if (invoice.status === 'draft') {
        const openRes = await fetch(`https://www.zohoapis.in/billing/v1/invoices/${invoice.invoice_id}/converttoopen`, { method: 'POST', headers });
        if (!openRes.ok) throw new Error(`Failed to convert to Open: ${await openRes.text()}`);
        console.log(green('   ✅ Converted to Open.'));
    }

    const payMode = dbOrder.paymentMode === 'COD' ? 'others' : 'banktransfer';
    const payRes = await zoho.createPayment({
        customer_id: invoice.customer_id,
        payment_mode: payMode,
        amount: Number(invoice.total),
        date: new Date(Date.now() + 330 * 60000).toISOString().split('T')[0], // IST
        invoice_id: invoice.invoice_id,
        reference_number: 'Sync Script',
        description: `Payment via sync script (${dbOrder.paymentMode})`,
    });

    if (payRes.status === 200 || payRes.status === 201) {
        console.log(green(`   ✅ Payment recorded! (₹${invoice.total})`));
    } else {
        throw new Error(`Payment failed: ${JSON.stringify(payRes.data)}`);
    }
}

main();
