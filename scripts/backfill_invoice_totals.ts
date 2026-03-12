import { config } from 'dotenv';
// Prefer repo-root .env.local (when running from project root),
// fallback to ../.env.local (when running from within scripts/).
config({ path: '.env.local' });
config({ path: '../.env.local' });

type Args = {
    from?: string;
    to?: string;
    limit: number;
    concurrency: number;
    dryRun: boolean;
    write: boolean;
};

function parseArgs(argv: string[]): Args {
    const args: Args = {
        limit: 0,
        concurrency: 5,
        dryRun: true, // safer default: no writes unless explicitly enabled
        write: false,
    };

    for (let i = 0; i < argv.length; i++) {
        const raw = argv[i];
        const eqIdx = raw.indexOf('=');
        const a = eqIdx >= 0 ? raw.slice(0, eqIdx) : raw;
        const inlineValue = eqIdx >= 0 ? raw.slice(eqIdx + 1) : undefined;

        const nextValue = () => inlineValue ?? argv[++i];

        if (a === '--from') args.from = nextValue();
        else if (a === '--to') args.to = nextValue();
        else if (a === '--limit') args.limit = Number(nextValue() ?? 0) || 0;
        else if (a === '--concurrency') args.concurrency = Math.max(1, Number(nextValue() ?? 5) || 5);
        else if (a === '--dry-run') args.dryRun = true;
        else if (a === '--write') {
            args.write = true;
            args.dryRun = false;
        }
    }

    return args;
}

async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let idx = 0;

    const workers = new Array(Math.max(1, limit)).fill(0).map(async () => {
        while (idx < items.length) {
            const current = idx++;
            results[current] = await fn(items[current], current);
        }
    });

    await Promise.all(workers);
    return results;
}

function buildDateQuery(from?: string, to?: string): { $gte?: Date; $lte?: Date } | undefined {
    if (!from && !to) return undefined;
    const q: { $gte?: Date; $lte?: Date } = {};
    if (from) {
        const d = new Date(from);
        d.setHours(0, 0, 0, 0);
        q.$gte = d;
    }
    if (to) {
        const d = new Date(to);
        d.setHours(23, 59, 59, 999);
        q.$lte = d;
    }
    return q;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    console.log('--- Backfill Order.invoiceTotal ---');
    console.log(`mode=${args.write ? 'write' : 'dry-run'} limit=${args.limit || 'all'} concurrency=${args.concurrency}`);
    if (args.from || args.to) console.log(`dateRange: from=${args.from || '—'} to=${args.to || '—'}`);
    if (!args.write) {
        console.log('Tip: pass --write to persist invoiceTotal updates.');
    }

    console.log('Connecting to database...');
    // IMPORTANT: dynamic imports ensure dotenv has already populated process.env
    // before mongodb.ts reads MONGODB_URI at module initialization.
    const [{ default: connectDB }, { default: Order }, { getInvoice }] = await Promise.all([
        import('../src/lib/mongodb'),
        import('../src/models/Order'),
        import('../src/lib/zoho'),
    ]);
    await connectDB();

    const createdAt = buildDateQuery(args.from, args.to);

    const baseQuery: Record<string, unknown> = {
        $or: [{ invoiceTotal: { $exists: false } }, { invoiceTotal: null }],
    };
    if (createdAt) baseQuery.createdAt = createdAt;

    let q = Order.find(baseQuery).sort({ createdAt: -1 });
    if (args.limit && args.limit > 0) q = q.limit(args.limit);

    const orders = await q.lean();
    console.log(`Found ${orders.length} orders missing invoiceTotal.`);

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    await mapWithConcurrency(orders, args.concurrency, async (order, index) => {
        const zohoInvoiceId = (order as { zohoInvoiceId?: string }).zohoInvoiceId;
        const orderId = (order as { orderId?: string }).orderId || (order as any)._id?.toString?.() || 'UNKNOWN';

        const prefix = `[${index + 1}/${orders.length}] ${orderId}`;

        if (!zohoInvoiceId) {
            console.warn(`${prefix}: missing zohoInvoiceId → skip`);
            skipped++;
            return;
        }

        try {
            const inv = await getInvoice(zohoInvoiceId);
            const zohoTotal = Number(inv.data?.invoice?.total);

            if (inv.status !== 200 || !Number.isFinite(zohoTotal)) {
                console.warn(`${prefix}: Zoho fetch failed (HTTP ${inv.status})`);
                failed++;
                return;
            }

            if (args.dryRun || !args.write) {
                console.log(`${prefix}: would set invoiceTotal=${zohoTotal}`);
                updated++;
                return;
            }

            await Order.updateOne(
                { _id: (order as any)._id },
                { $set: { invoiceTotal: zohoTotal } }
            );

            console.log(`${prefix}: set invoiceTotal=${zohoTotal}`);
            updated++;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown error';
            console.warn(`${prefix}: ERROR ${msg}`);
            failed++;
        }
    });

    console.log('\n--- Backfill Complete ---');
    console.log(`Total processed: ${orders.length}`);
    console.log(`Updated        : ${updated}${args.dryRun ? ' (dry-run)' : ''}`);
    console.log(`Skipped        : ${skipped}`);
    console.log(`Failed         : ${failed}`);

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
});

