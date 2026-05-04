/**
 * generate_gst_report.ts
 *
 * Generates a GST report CSV by merging invoice data from MongoDB and Zoho Billing.
 *
 * Priority:
 *   - Invoices in both systems  → use MongoDB line items + Zoho date
 *   - Invoices only in MongoDB  → use MongoDB (fallback createdAt for date)
 *   - Invoices only in Zoho     → fetch full details from Zoho
 *   - Voided invoices           → excluded entirely
 *
 * Usage:
 *   npx tsx scripts/generate_gst_report.ts
 *   npx tsx scripts/generate_gst_report.ts --from=2026-03-01 --to=2026-03-31
 *   npx tsx scripts/generate_gst_report.ts --output=gst_march_2026.csv
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '../.env.local' });

import fs from 'fs';
import path from 'path';

// ── Console Colors ──────────────────────────────────────────────
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red    = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ── Types ───────────────────────────────────────────────────────

interface CliArgs {
    output: string;
    from?: string;
    to?: string;
}

interface CsvRow {
    invoiceDate: string;
    invoiceNumber: string;
    lineItem: string;
    unitPrice: string;
    qty: string;
    netPrice: string;
    gstPerc: string;
    gstAmount: string;
    totalAmount: string;
    discount: string;
    invoiceTotal: string;
}

// ── CLI Argument Parsing ────────────────────────────────────────

function parseCliArgs(argv: string[]): CliArgs {
    const args: CliArgs = { output: 'gst_report_final.csv' };
    for (const raw of argv) {
        if (raw.startsWith('--output=')) args.output = raw.split('=')[1];
        else if (raw.startsWith('--from=')) args.from = raw.split('=')[1];
        else if (raw.startsWith('--to=')) args.to = raw.split('=')[1];
    }
    return args;
}

// ── CSV Helpers ─────────────────────────────────────────────────

function escapeCsv(field: string | number | undefined | null): string {
    if (field === null || field === undefined) return '';
    let str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        str = str.replace(/"/g, '""');
        return `"${str}"`;
    }
    return str;
}

const CSV_HEADERS = [
    'Invoice Date',
    'Invoice Number',
    'Line Item',
    'Unit Price',
    'Qty',
    'Net Price',
    'GST %',
    'GST Amount',
    'Total Amount',
    'Discount',
    'Invoice Total',
];

function rowToCsvLine(row: CsvRow): string {
    return [
        escapeCsv(row.invoiceDate),
        escapeCsv(row.invoiceNumber),
        escapeCsv(row.lineItem),
        escapeCsv(row.unitPrice),
        escapeCsv(row.qty),
        escapeCsv(row.netPrice),
        escapeCsv(row.gstPerc),
        escapeCsv(row.gstAmount),
        escapeCsv(row.totalAmount),
        escapeCsv(row.discount),
        escapeCsv(row.invoiceTotal),
    ].join(',');
}

// ── Date Helpers ────────────────────────────────────────────────

/** Convert any date-like value to YYYY-MM-DD string. */
function toDateStr(value: string | Date | undefined | null): string {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toISOString().split('T')[0];
}

/** Check if a YYYY-MM-DD string falls within [from, to] range. */
function isDateInRange(dateStr: string, from?: string, to?: string): boolean {
    if (!dateStr) return true; // No date to filter on — include by default
    if (from && dateStr < from) return false;
    if (to && dateStr > to) return false;
    return true;
}

// ── GST Calculation ─────────────────────────────────────────────

/**
 * Resolve the GST percentage for a line item.
 *
 * Priority: HSN_TAX_RATES map → Zoho's tax_percentage field → 0%
 * The MongoDB tax_percentage field is intentionally NOT trusted.
 */
function resolveGstRate(
    hsnCode: string | undefined,
    hsnTaxRates: Record<string, number>,
    zohoTaxPercentage?: number,
): number {
    // 1. HSN map (single source of truth)
    if (hsnCode && hsnTaxRates[hsnCode] !== undefined) {
        return hsnTaxRates[hsnCode];
    }
    // 2. Zoho's tax_percentage (for Zoho-only items or unknown HSNs)
    if (zohoTaxPercentage !== undefined && zohoTaxPercentage > 0) {
        return zohoTaxPercentage;
    }
    // 3. Fallback — unknown item, assume 0%
    return 0;
}

interface GstFields {
    unitPrice: number;   // tax-exclusive per-unit price
    qty: number;
    netPrice: number;    // unitPrice × qty
    gstPerc: number;
    gstAmount: number;   // tax on netPrice
    totalAmount: number; // netPrice + gstAmount (2 decimal places, NOT rounded per-line)
}

/**
 * Compute GST fields from a MongoDB line item.
 * MongoDB stores tax-INCLUSIVE prices, so we reverse-calculate.
 */
function computeGstFromMongoItem(
    item: Record<string, any>,
    hsnTaxRates: Record<string, number>,
): GstFields {
    const qty = Number(item.quantity || 1);
    const gstPerc = resolveGstRate(item.hsn_or_sac, hsnTaxRates);
    const taxMultiplier = 1 + (gstPerc / 100);

    // Derive tax-exclusive unit price.
    // Priority: item_total (already tax-excl total) → final_price (tax-incl unit) → rate (tax-incl unit)
    let unitPrice: number;
    if (typeof item.item_total === 'number' && item.item_total > 0) {
        // item_total is tax-exclusive TOTAL for the line
        unitPrice = item.item_total / qty;
    } else if (typeof item.final_price === 'number' && item.final_price > 0) {
        unitPrice = item.final_price / taxMultiplier;
    } else {
        const rate = Number(item.rate || 0);
        unitPrice = taxMultiplier > 1 ? rate / taxMultiplier : rate;
    }

    unitPrice = round2(unitPrice);
    const netPrice = round2(unitPrice * qty);
    const gstAmount = round2(netPrice * (gstPerc / 100));
    const totalAmount = round2(netPrice + gstAmount);

    return { unitPrice, qty, netPrice, gstPerc, gstAmount, totalAmount };
}

/**
 * Compute GST fields from a Zoho line item.
 * Zoho stores tax-EXCLUSIVE prices natively.
 *
 * Note: Some Zoho items have rate=0 (e.g. when originally entered tax-inclusive).
 * In that case, we derive unit price from item_total / qty.
 */
function computeGstFromZohoItem(
    item: Record<string, any>,
    hsnTaxRates: Record<string, number>,
): GstFields {
    const qty = Number(item.quantity || 1);
    const gstPerc = resolveGstRate(item.hsn_or_sac, hsnTaxRates, Number(item.tax_percentage || 0));
    const itemTotal = Number(item.item_total || 0);
    const rawRate = Number(item.rate || 0);

    // Prefer Zoho's explicit rate; fall back to deriving from item_total
    const unitPrice = round2(rawRate > 0 ? rawRate : (itemTotal > 0 ? itemTotal / qty : 0));
    const netPrice = round2(itemTotal > 0 ? itemTotal : unitPrice * qty);
    const gstAmount = round2(Number(item.tax_amount || netPrice * (gstPerc / 100)));
    const totalAmount = round2(netPrice + gstAmount);

    return { unitPrice, qty, netPrice, gstPerc, gstAmount, totalAmount };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

// ── Data Fetching ───────────────────────────────────────────────

async function loadDependencies() {
    console.log(dim('Loading dependencies...'));
    const [{ default: connectDB }, { default: Order }, zoho, { HSN_TAX_RATES }] = await Promise.all([
        import('../src/lib/mongodb'),
        import('../src/models/Order'),
        import('../src/lib/zoho'),
        import('../src/lib/tax'),
    ]);
    await connectDB();
    console.log(green('✅ MongoDB connected.'));
    return { Order, zoho, HSN_TAX_RATES };
}

async function fetchMongoOrders(
    Order: any,
    dateFilter?: { from?: string; to?: string },
): Promise<Map<string, any>> {
    console.log(dim('Fetching orders from MongoDB...'));

    const query: Record<string, any> = {};
    if (dateFilter?.from || dateFilter?.to) {
        const dateRange: Record<string, any> = {};
        if (dateFilter.from) dateRange.$gte = new Date(dateFilter.from);
        if (dateFilter.to) {
            const to = new Date(dateFilter.to);
            to.setHours(23, 59, 59, 999);
            dateRange.$lte = to;
        }
        query.createdAt = dateRange;
    }

    const orders = await Order.find(query).lean() as any[];
    console.log(green(`✅ Found ${orders.length} orders in MongoDB.`));

    const map = new Map<string, any>();
    for (const o of orders) {
        if (o.orderId) map.set(o.orderId, o);
    }
    return map;
}

async function fetchZohoInvoiceSummaries(zoho: any): Promise<Map<string, any>> {
    console.log(dim('Fetching all invoices from Zoho Billing (paginated)...'));
    const all = await zoho.fetchAllInvoices();
    console.log(green(`✅ Found ${all.length} invoices in Zoho.`));

    const map = new Map<string, any>();
    for (const inv of all) {
        // Exclude voided invoices
        if (inv.status === 'void') continue;
        if (inv.invoice_number) map.set(inv.invoice_number, inv);
    }
    return map;
}

/**
 * Batch-fetch full invoice details from Zoho for a list of invoice IDs.
 * Needed because the list endpoint doesn't return line items.
 */
async function fetchZohoFullDetails(
    zoho: any,
    invoiceIds: Array<{ number: string; id: string }>,
): Promise<Map<string, any>> {
    const BATCH_SIZE = 5;
    const BATCH_DELAY_MS = 500;
    const details = new Map<string, any>();

    for (let i = 0; i < invoiceIds.length; i += BATCH_SIZE) {
        const batch = invoiceIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
            batch.map(async ({ number: num, id }) => {
                try {
                    const res = await zoho.getInvoice(id);
                    if (res.status === 200 && res.data?.invoice) {
                        return { num, invoice: res.data.invoice };
                    }
                } catch {
                    console.warn(yellow(`  ⚠ Failed to fetch Zoho details for ${num}`));
                }
                return null;
            }),
        );

        for (const r of results) {
            if (r) details.set(r.num, r.invoice);
        }

        const progress = Math.min(i + BATCH_SIZE, invoiceIds.length);
        process.stdout.write(`\r  Fetched ${progress}/${invoiceIds.length} full invoices from Zoho...`);

        if (i + BATCH_SIZE < invoiceIds.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }

    if (invoiceIds.length > 0) console.log('');
    return details;
}

// ── Row Builders ────────────────────────────────────────────────

/**
 * Build CSV rows from a MongoDB order.
 * Uses Zoho summary (if available) for the invoice date.
 */
function buildRowsFromMongo(
    order: Record<string, any>,
    zohoSummary: Record<string, any> | undefined,
    hsnTaxRates: Record<string, number>,
): CsvRow[] {
    const invoiceNumber = order.orderId || '';
    const invoiceDate = zohoSummary?.date
        ? toDateStr(zohoSummary.date)
        : toDateStr(order.createdAt); // fallback for DB-only invoices
    const invoiceTotal = order.invoiceTotal ?? zohoSummary?.total ?? '';
    const discountTotal = zohoSummary?.discount_total ?? zohoSummary?.discount ?? '';
    const items: any[] = order.invoiceItems || [];

    return items.map(item => {
        const gst = computeGstFromMongoItem(item, hsnTaxRates);
        return {
            invoiceDate,
            invoiceNumber,
            lineItem: item.name || '',
            unitPrice: gst.unitPrice.toFixed(2),
            qty: String(gst.qty),
            netPrice: gst.netPrice.toFixed(2),
            gstPerc: String(gst.gstPerc),
            gstAmount: gst.gstAmount.toFixed(2),
            totalAmount: gst.totalAmount.toFixed(2),
            discount: String(discountTotal),
            invoiceTotal: String(invoiceTotal),
        };
    });
}

/**
 * Build CSV rows from a Zoho full invoice detail.
 */
function buildRowsFromZoho(
    zohoInvoice: Record<string, any>,
    hsnTaxRates: Record<string, number>,
): CsvRow[] {
    const invoiceNumber = zohoInvoice.invoice_number || '';
    const invoiceDate = toDateStr(zohoInvoice.date);
    const invoiceTotal = zohoInvoice.total ?? '';
    const discountTotal = zohoInvoice.discount_total ?? zohoInvoice.discount ?? '';
    const items: any[] = zohoInvoice.invoice_items || [];

    return items.map(item => {
        const gst = computeGstFromZohoItem(item, hsnTaxRates);
        return {
            invoiceDate,
            invoiceNumber,
            lineItem: item.name || '',
            unitPrice: gst.unitPrice.toFixed(2),
            qty: String(gst.qty),
            netPrice: gst.netPrice.toFixed(2),
            gstPerc: String(gst.gstPerc),
            gstAmount: gst.gstAmount.toFixed(2),
            totalAmount: gst.totalAmount.toFixed(2),
            discount: String(discountTotal),
            invoiceTotal: String(invoiceTotal),
        };
    });
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
    const args = parseCliArgs(process.argv.slice(2));

    console.log(bold('\n📊 GST Report Generator — MongoDB + Zoho\n'));
    console.log(`Output:       ${cyan(args.output)}`);
    if (args.from || args.to) {
        console.log(`Date filter:  ${args.from || '—'} → ${args.to || '—'}`);
    }

    // ── 1. Load dependencies & connect ──────────────────────────
    const { Order, zoho, HSN_TAX_RATES } = await loadDependencies();

    // ── 2. Fetch data from both sources ─────────────────────────
    const dbMap = await fetchMongoOrders(Order, { from: args.from, to: args.to });
    const zohoMap = await fetchZohoInvoiceSummaries(zoho);

    // ── 3. Classify invoices ────────────────────────────────────
    const allInvoiceNumbers = new Set<string>([...dbMap.keys(), ...zohoMap.keys()]);
    console.log(dim(`\nTotal unique invoice numbers: ${allInvoiceNumbers.size}`));

    const inBoth: string[] = [];
    const dbOnly: string[] = [];
    const zohoOnly: Array<{ number: string; id: string }> = [];

    for (const num of allInvoiceNumbers) {
        const inDb = dbMap.has(num);
        const inZoho = zohoMap.has(num);

        if (inDb && inZoho) inBoth.push(num);
        else if (inDb) dbOnly.push(num);
        else if (inZoho) {
            const zohoSummary = zohoMap.get(num);
            // Apply date filter to Zoho-only invoices
            const zohoDate = toDateStr(zohoSummary.date);
            if (isDateInRange(zohoDate, args.from, args.to)) {
                zohoOnly.push({ number: num, id: zohoSummary.invoice_id });
            }
        }
    }

    console.log(`  In both:      ${green(String(inBoth.length))}`);
    console.log(`  DB only:      ${yellow(String(dbOnly.length))}`);
    console.log(`  Zoho only:    ${yellow(String(zohoOnly.length))}`);

    // ── 4. Fetch full Zoho details for Zoho-only invoices ───────
    let zohoFullDetails = new Map<string, any>();
    if (zohoOnly.length > 0) {
        console.log(dim('\nFetching full Zoho details for Zoho-only invoices...'));
        zohoFullDetails = await fetchZohoFullDetails(zoho, zohoOnly);
        console.log(green(`✅ Fetched ${zohoFullDetails.size} full invoice details.`));
    }

    // ── 5. Build CSV rows ───────────────────────────────────────
    console.log(dim('\nBuilding CSV rows...'));
    const allRows: CsvRow[] = [];
    let warnCount = 0;

    // 5a. Invoices in BOTH systems → use MongoDB data + Zoho date
    for (const num of inBoth) {
        const rows = buildRowsFromMongo(dbMap.get(num)!, zohoMap.get(num), HSN_TAX_RATES);
        allRows.push(...rows);
    }

    // 5b. DB-only invoices → use MongoDB data
    for (const num of dbOnly) {
        const rows = buildRowsFromMongo(dbMap.get(num)!, undefined, HSN_TAX_RATES);
        allRows.push(...rows);
    }

    // 5c. Zoho-only invoices → use Zoho full details
    for (const { number: num } of zohoOnly) {
        const fullInvoice = zohoFullDetails.get(num);
        if (!fullInvoice) {
            console.warn(yellow(`  ⚠ Skipping ${num}: could not fetch full details`));
            warnCount++;
            continue;
        }
        const rows = buildRowsFromZoho(fullInvoice, HSN_TAX_RATES);
        allRows.push(...rows);
    }

    // ── 6. Sort by date → invoice number ────────────────────────
    allRows.sort((a, b) => {
        const dateCmp = a.invoiceDate.localeCompare(b.invoiceDate);
        if (dateCmp !== 0) return dateCmp;
        return a.invoiceNumber.localeCompare(b.invoiceNumber);
    });

    // ── 7. Write CSV ────────────────────────────────────────────
    const csvLines = [CSV_HEADERS.join(','), ...allRows.map(rowToCsvLine)];
    const outputPath = path.resolve(process.cwd(), args.output);
    fs.writeFileSync(outputPath, csvLines.join('\n'), 'utf-8');

    // ── 8. Summary ──────────────────────────────────────────────
    console.log(bold('\n━━━ Summary ━━━'));
    console.log(`Invoices processed:  ${allInvoiceNumbers.size}`);
    console.log(`  From MongoDB:      ${green(String(inBoth.length + dbOnly.length))}`);
    console.log(`  From Zoho only:    ${cyan(String(zohoOnly.length))}`);
    console.log(`CSV rows (items):    ${green(String(allRows.length))}`);
    if (warnCount > 0) {
        console.log(`Warnings:            ${yellow(String(warnCount))}`);
    }
    console.log(`\n📁 Saved to: ${cyan(outputPath)}`);

    process.exit(0);
}

main().catch(err => {
    console.error(red('Fatal error:'), err);
    process.exit(1);
});
