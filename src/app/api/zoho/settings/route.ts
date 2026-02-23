import { NextResponse } from 'next/server';
import { fetchInvoiceSettings } from '@/lib/zoho';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { data } = await fetchInvoiceSettings();
        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error('Error fetching invoice settings from Zoho:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
