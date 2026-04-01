/**
 * find_draft_delivered.ts
 *
 * Finds orders that are still marked as "draft" on Zoho Billing
 * but have been delivered according to the Delhivery tracking API
 * (or marked as "Order Completed" for self-shipped orders in DB).
 *
 * Flow:
 *   1. Fetch all draft invoices from Zoho Billing
 *   2. Find matching orders in the DB (to get waybills)
 *   3. For Delhivery orders — track each waybill via Delhivery API
 *      and check if StatusType === "DELIVERED"
 *   4. For self-shipped orders — check if selfShipmentStatus === "Order Completed"
 *   5. Return the list of orderIds that are draft on Zoho but delivered
 *   6. Convert those draft invoices to Open and record a payment to mark them as Paid
 *
 * Usage:  npx tsx scripts/find_draft_delivered.ts
 */

import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(__dirname, '..', '.env.local') });

import mongoose from 'mongoose';
import Order from '../src/models/Order';

// ── Zoho OAuth ──────────────────────────────────────────────────
const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.in';
const ZOHO_API_BASE = 'https://www.zohoapis.in/billing/v1';

async function getZohoAccessToken(): Promise<string> {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Missing Zoho OAuth credentials in environment variables');
    }

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    });

    const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to refresh Zoho token: ${res.status} — ${text}`);
    }

    const data = await res.json();
    if (data.error) throw new Error(`Zoho OAuth error: ${data.error}`);

    return data.access_token;
}

function zohoHeaders(token: string): Record<string, string> {
    const orgId = process.env.ZOHO_ORG_ID;
    if (!orgId) throw new Error('Missing ZOHO_ORG_ID in environment variables');

    return {
        Authorization: `Zoho-oauthtoken ${token}`,
        'X-com-zoho-subscriptions-organizationid': orgId,
        'Content-Type': 'application/json',
    };
}

// ── Delhivery Tracking ──────────────────────────────────────────
const DELHIVERY_TRACK_BASE = 'https://track.delhivery.com';

function getDelhiveryToken(): string {
    const token = process.env.DELHIVERY_API_TOKEN;
    if (!token) throw new Error('Missing DELHIVERY_API_TOKEN in environment variables');
    return token;
}

async function trackWaybill(waybill: string): Promise<string | null> {
    const url = `${DELHIVERY_TRACK_BASE}/api/v1/packages/json/?waybill=${waybill}`;

    const res = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Token ${getDelhiveryToken()}`,
            'Content-Type': 'application/json',
        },
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        console.warn(`    ⚠ Invalid JSON from Delhivery for waybill ${waybill}`);
        return null;
    }

    // Extract the status type from the tracking response
    // Structure: data.ShipmentData[0].Shipment.Status.StatusType
    const shipmentData = data?.ShipmentData?.[0]?.Shipment;
    if (!shipmentData) return null;

    const statusType =
        shipmentData.CurrentStatus?.StatusType ||
        shipmentData.Status?.StatusType ||
        null;

    return statusType;
}

// ── Fetch ALL draft invoices from Zoho (paginated) ──────────────
interface ZohoInvoice {
    invoice_id: string;
    invoice_number: string;
    customer_id: string;
    customer_name: string;
    status: string;
    total: number;
    date: string;
}

// ── Zoho Payment Helpers ────────────────────────────────────────

/**
 * Convert a Draft invoice to "Open" status.
 * Endpoint: POST /invoices/{invoice_id}/converttoopen
 */
async function convertInvoiceToOpen(token: string, invoiceId: string): Promise<boolean> {
    const res = await fetch(`${ZOHO_API_BASE}/invoices/${invoiceId}/converttoopen`, {
        method: 'POST',
        headers: zohoHeaders(token),
    });

    if (!res.ok) {
        const text = await res.text();
        console.error(`     ✖ Failed to open invoice ${invoiceId}: ${text}`);
        return false;
    }
    return true;
}

/**
 * Record a Payment against an Open Invoice.
 * Uses "banktransfer" for Prepaid orders, "others" for COD orders.
 */
async function recordPaymentForInvoice(
    token: string,
    invoiceId: string,
    customerId: string,
    amount: number,
    paymentMode: string
): Promise<boolean> {
    // Determine Zoho payment_mode based on order payment mode
    const zohoPaymentMode = paymentMode === 'COD' ? 'others' : 'banktransfer';

    const payload = {
        customer_id: customerId,
        payment_mode: zohoPaymentMode,
        amount: amount,
        date: new Date().toISOString().split('T')[0],
        reference_number: 'Automated Script - Delivered',
        description: `Payment automatically recorded because order was marked DELIVERED via API tracking. (${paymentMode})`,
        invoices: [
            {
                invoice_id: invoiceId,
                amount_applied: amount,
            },
        ],
    };

    const res = await fetch(`${ZOHO_API_BASE}/payments`, {
        method: 'POST',
        headers: zohoHeaders(token),
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const text = await res.text();
        console.error(`     ✖ Failed to apply payment to ${invoiceId}: ${text}`);
        return false;
    }
    return true;
}

async function fetchAllDraftInvoices(token: string): Promise<ZohoInvoice[]> {
    const headers = zohoHeaders(token);
    const allInvoices: ZohoInvoice[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const params = new URLSearchParams({
            status: 'draft',
            per_page: '200',
            page: String(page),
        });

        const res = await fetch(`${ZOHO_API_BASE}/invoices?${params.toString()}`, {
            method: 'GET',
            headers,
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Failed to fetch draft invoices (page ${page}): ${res.status} — ${text}`);
        }

        const data = await res.json();
        const invoices: ZohoInvoice[] = data.invoices || [];
        allInvoices.push(...invoices);

        console.log(`  Page ${page}: fetched ${invoices.length} draft invoice(s)`);

        hasMore = data.page_context?.has_more_page ?? false;
        page++;
    }

    return allInvoices;
}

// ── Main ────────────────────────────────────────────────────────
// Concurrency limit to avoid hammering Delhivery API
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 500; // pause between batches

async function main() {
    // 1. Authenticate with Zoho
    console.log('🔑 Authenticating with Zoho...');
    const token = await getZohoAccessToken();
    console.log('✅ Zoho token obtained.\n');

    // 2. Fetch all draft invoices from Zoho
    console.log('📄 Fetching draft invoices from Zoho...');
    const draftInvoices = await fetchAllDraftInvoices(token);
    console.log(`\n📦 Total draft invoices on Zoho: ${draftInvoices.length}\n`);

    if (draftInvoices.length === 0) {
        console.log('No draft invoices found. Nothing to check.');
        process.exit(0);
    }

    // 3. Connect to MongoDB
    console.log('🗄️  Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI as string, {
        tls: true,
        tlsAllowInvalidCertificates: true,
    });
    console.log('✅ MongoDB connected.\n');

    // 4. Find matching orders in the DB
    const draftInvoiceIds = draftInvoices.map((inv) => inv.invoice_id);

    const matchingOrders = await Order.find({
        zohoInvoiceId: { $in: draftInvoiceIds },
    })
        .select('orderId zohoInvoiceId waybill shipments selfShipped status selfShipmentStatus paymentMode customerDetails.customer_name')
        .lean() as any[];

    console.log(`🔍 Found ${matchingOrders.length} order(s) in DB matching draft Zoho invoices.\n`);

    if (matchingOrders.length === 0) {
        console.log('No matching orders found in the DB. Done.');
        await mongoose.disconnect();
        process.exit(0);
    }

    // 5. Check delivery status for each order
    const deliveredOrders: { orderId: string; zohoInvoiceId: string; customerName: string; source: string; paymentMode: string }[] = [];
    let checkedCount = 0;

    for (let i = 0; i < matchingOrders.length; i += BATCH_SIZE) {
        const batch = matchingOrders.slice(i, i + BATCH_SIZE);

        await Promise.all(
            batch.map(async (order: any) => {
                checkedCount++;
                const isSelfShipped =
                    order.selfShipped === true ||
                    order.status === 'SELF_SHIPPED' ||
                    (order.shipments && order.shipments.some((s: any) => s.vendor === 'SELF'));

                // --- Self-shipped: check DB selfShipmentStatus ---
                if (isSelfShipped) {
                    if (order.selfShipmentStatus === 'Order Completed') {
                        deliveredOrders.push({
                            orderId: order.orderId,
                            zohoInvoiceId: order.zohoInvoiceId,
                            customerName: order.customerDetails?.customer_name || 'N/A',
                            source: 'Self-Shipped (Order Completed)',
                            paymentMode: order.paymentMode || 'Prepaid',
                        });
                        process.stdout.write(`  ✔ ${order.orderId} — Self-shipped DELIVERED\n`);
                    } else {
                        process.stdout.write(`  · ${order.orderId} — Self-shipped (${order.selfShipmentStatus || 'Order Created'})\n`);
                    }
                    return;
                }

                // --- Delhivery: get waybill and track ---
                const waybill =
                    order.waybill ||
                    (order.shipments && order.shipments.length > 0 ? order.shipments[0].waybill : null);

                if (!waybill) {
                    process.stdout.write(`  · ${order.orderId} — No waybill, skipping\n`);
                    return;
                }

                try {
                    const statusType = await trackWaybill(waybill);

                    if (statusType?.toUpperCase() === 'DELIVERED' || statusType?.toUpperCase() === 'DL') {
                        deliveredOrders.push({
                            orderId: order.orderId,
                            zohoInvoiceId: order.zohoInvoiceId,
                            customerName: order.customerDetails?.customer_name || 'N/A',
                            source: `Delhivery (WB: ${waybill})`,
                            paymentMode: order.paymentMode || 'Prepaid',
                        });
                        process.stdout.write(`  ✔ ${order.orderId} — DELIVERED (WB: ${waybill})\n`);
                    } else {
                        process.stdout.write(`  · ${order.orderId} — ${statusType || 'UNKNOWN'} (WB: ${waybill})\n`);
                    }
                } catch (err: any) {
                    process.stdout.write(`  ✖ ${order.orderId} — Delhivery error: ${err.message}\n`);
                }
            })
        );

        // Rate-limit between batches
        if (i + BATCH_SIZE < matchingOrders.length) {
            await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
        }
    }

    // 6. Output results
    console.log('\n' + '─'.repeat(60));

    if (deliveredOrders.length === 0) {
        console.log('\n✅ No orders found that are DRAFT on Zoho AND DELIVERED.\n');
    } else {
        console.log(
            `\n⚠️  Found ${deliveredOrders.length} order(s) that are DRAFT on Zoho but DELIVERED:\n`
        );

        for (const o of deliveredOrders) {
            console.log(`  • ${o.orderId}  |  Zoho: ${o.zohoInvoiceId}  |  ${o.source}  |  ${o.customerName}`);
        }

        const orderIds = deliveredOrders.map((o) => o.orderId);
        console.log('\n📋 Order IDs:');
        console.log(JSON.stringify(orderIds, null, 2));

        // ── 7. Auto-pay delivered invoices on Zoho ──────────────────
        console.log('\n============================================================');
        console.log('🔄 STARTING ZOHO AUTOMATIC PAYMENT UPDATES...');
        console.log('============================================================\n');

        let updatedCount = 0;

        for (const o of deliveredOrders) {
            const invoiceData = draftInvoices.find((inv) => inv.invoice_id === o.zohoInvoiceId);

            if (!invoiceData) {
                console.log(` ⚠ Could not find Zoho data for Order: ${o.orderId}`);
                continue;
            }

            process.stdout.write(` ⏳ Updating ${o.orderId} (Invoice: ${invoiceData.invoice_number}, Mode: ${o.paymentMode})...`);

            // Step 1: Convert Draft → Open
            const isOpen = await convertInvoiceToOpen(token, invoiceData.invoice_id);

            if (isOpen) {
                // Step 2: Record payment (banktransfer for Prepaid, others for COD)
                const isPaid = await recordPaymentForInvoice(
                    token,
                    invoiceData.invoice_id,
                    invoiceData.customer_id,
                    invoiceData.total,
                    o.paymentMode
                );

                if (isPaid) {
                    process.stdout.write(` ✅ Marked as PAID!\n`);
                    updatedCount++;
                }
            }

            // Rate-limit: Zoho allows ~1000 requests/day
            await new Promise((r) => setTimeout(r, 500));
        }

        console.log(`\n🎉 Successfully marked ${updatedCount} / ${deliveredOrders.length} invoices as PAID in Zoho.`);
    }

    console.log('\n' + '─'.repeat(60));
    console.log(`Total checked: ${checkedCount} | Delivered: ${deliveredOrders.length}`);

    await mongoose.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
