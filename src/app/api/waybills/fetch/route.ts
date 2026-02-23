import { NextRequest, NextResponse } from 'next/server';
import { fetchBulkWaybills } from '@/lib/delhivery';
import dbConnect from '@/lib/mongodb';
import Waybill from '@/models/Waybill';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const count = parseInt(searchParams.get('count') || '10', 10);

        if (isNaN(count) || count <= 0 || count > 10000) {
            return NextResponse.json(
                { error: 'count must be a number between 1 and 10000' },
                { status: 400 }
            );
        }

        // 1. Fetch from Delhivery
        const { status, data } = await fetchBulkWaybills(count);

        if (status !== 200 || !data || !data.trim()) {
            return NextResponse.json(
                { error: 'Failed to fetch waybills from Delhivery', details: data },
                { status: status !== 200 ? status : 500 }
            );
        }

        // The Bulk API returns a comma-separated string of waybills
        // e.g., "1122334455,2233445566,3344556677"
        let waybillsStr = '';

        // Wait, the bulk tracking API returns a string if we are reading it as JSON?
        // Let's actually check how it is normally returned by the bulk API. It's often text.
        // Wait, the documentation says Accept: application/json but sometimes it just returns a raw string
        // Let's handle both. If it parsed as a string:
        if (typeof data === 'string') {
            waybillsStr = data;
        } else if (data.waybills) { // if it returns { waybills: "..." }
            waybillsStr = data.waybills;
        } else {
            // fallback, maybe stringified json string
            waybillsStr = JSON.stringify(data).replace(/["']/g, ''); // strip quotes
        }

        const waybillList = waybillsStr.split(',').map((w: string) => w.trim()).filter(Boolean);

        if (waybillList.length === 0) {
            return NextResponse.json(
                { error: 'No waybills were returned properly', raw: data },
                { status: 400 }
            );
        }

        // 2. Connect to MongoDB
        await dbConnect();

        // 3. Store waybills efficiently
        let insertedCount = 0;
        let duplicateCount = 0;

        // Using bulkWrite for efficiency and to gracefully handle duplicates (unique constraint on 'waybill')
        const bulkOps = waybillList.map((waybillNum: string) => ({
            updateOne: {
                filter: { waybill: waybillNum },
                update: { $setOnInsert: { waybill: waybillNum, status: 'UNUSED' } },
                upsert: true
            }
        }));

        if (bulkOps.length > 0) {
            const bulkResult = await Waybill.bulkWrite(bulkOps);
            // $setOnInsert creates new docs, upsertedCount tracks how many were brand new
            insertedCount = bulkResult.upsertedCount;
            duplicateCount = waybillList.length - insertedCount;
        }

        return NextResponse.json({
            message: 'Successfully fetched and stored waybills',
            totalFetched: waybillList.length,
            insertedContent: insertedCount,
            duplicateCount: duplicateCount,
            waybills: waybillList
        });

    } catch (error) {
        console.error('Error fetching bulk waybills:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
