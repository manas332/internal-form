/**
 * test_mark_paid.ts
 *
 * Test script to mark a single Zoho invoice as Paid.
 * Steps: Draft → Open → Record Payment
 *
 * Usage:  npx tsx scripts/test_mark_paid.ts INV-000402
 */

import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(__dirname, '..', '.env.local') });

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.in';
const ZOHO_API_BASE = 'https://www.zohoapis.in/billing/v1';

async function getAccessToken(): Promise<string> {
    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: process.env.ZOHO_CLIENT_ID!,
        client_secret: process.env.ZOHO_CLIENT_SECRET!,
        refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    });

    const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    const data = await res.json();
    if (data.error) throw new Error(`Zoho OAuth error: ${data.error}`);
    return data.access_token;
}

function headers(token: string): Record<string, string> {
    return {
        Authorization: `Zoho-oauthtoken ${token}`,
        'X-com-zoho-subscriptions-organizationid': process.env.ZOHO_ORG_ID!,
        'Content-Type': 'application/json',
    };
}

async function main() {
    const invoiceNumber = process.argv[2];
    if (!invoiceNumber) {
        console.error('Usage: npx tsx scripts/test_mark_paid.ts <INVOICE_NUMBER>');
        console.error('Example: npx tsx scripts/test_mark_paid.ts INV-000402');
        process.exit(1);
    }

    // 1. Get token
    console.log('🔑 Getting Zoho access token...');
    const token = await getAccessToken();
    console.log('✅ Token obtained.\n');

    // 2. Search for the invoice by number
    console.log(`🔍 Looking up invoice: ${invoiceNumber}...`);
    const searchRes = await fetch(
        `${ZOHO_API_BASE}/invoices?invoice_number=${encodeURIComponent(invoiceNumber)}`,
        { method: 'GET', headers: headers(token) }
    );
    const searchData = await searchRes.json();
    const invoices = searchData.invoices || [];

    if (invoices.length === 0) {
        console.error(`❌ No invoice found with number: ${invoiceNumber}`);
        process.exit(1);
    }

    const invoice = invoices[0];
    console.log(`\n📄 Found Invoice:`);
    console.log(`   ID:         ${invoice.invoice_id}`);
    console.log(`   Number:     ${invoice.invoice_number}`);
    console.log(`   Customer:   ${invoice.customer_name} (${invoice.customer_id})`);
    console.log(`   Status:     ${invoice.status}`);
    console.log(`   Total:      ₹${invoice.total}`);
    console.log('');

    // 3. Convert Draft → Open (only if it's still a draft)
    if (invoice.status === 'draft') {
        process.stdout.write('⏳ Converting Draft → Open...');
        const openRes = await fetch(
            `${ZOHO_API_BASE}/invoices/${invoice.invoice_id}/converttoopen`,
            { method: 'POST', headers: headers(token) }
        );

        if (!openRes.ok) {
            const text = await openRes.text();
            console.error(`\n❌ Failed to open invoice: ${text}`);
            process.exit(1);
        }
        console.log(' ✅ Done');
    } else {
        console.log(`ℹ️  Invoice is already "${invoice.status}", skipping convert-to-open.`);
    }

    // 4. Record Payment
    process.stdout.write('⏳ Recording payment...');
    const paymentPayload = {
        customer_id: invoice.customer_id,
        payment_mode: 'banktransfer',
        amount: invoice.total,
        date: new Date().toISOString().split('T')[0],
        reference_number: 'Test - Manual Script',
        description: `Test payment for ${invoiceNumber}`,
        invoices: [
            {
                invoice_id: invoice.invoice_id,
                amount_applied: invoice.total,
            },
        ],
    };

    const payRes = await fetch(`${ZOHO_API_BASE}/payments`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(paymentPayload),
    });

    const payData = await payRes.json();

    if (!payRes.ok) {
        console.error(`\n❌ Failed to record payment: ${JSON.stringify(payData)}`);
        process.exit(1);
    }

    console.log(' ✅ Done');
    console.log(`\n🎉 Invoice ${invoiceNumber} has been marked as PAID!`);
    console.log(`   Payment ID: ${payData.payment?.payment_id || 'N/A'}`);
}

main().catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
