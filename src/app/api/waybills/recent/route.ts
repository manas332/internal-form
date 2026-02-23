import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Waybill from '@/models/Waybill';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        await dbConnect();

        // Fetch the 10 most recent waybills
        const recentWaybills = await Waybill.find({})
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();

        return NextResponse.json({
            success: true,
            waybills: recentWaybills
        });

    } catch (error) {
        console.error('Error fetching recent waybills:', error);
        return NextResponse.json(
            { error: 'Failed to fetch recent waybills from database' },
            { status: 500 }
        );
    }
}
