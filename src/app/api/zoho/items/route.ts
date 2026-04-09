import { fetchAllActiveItems } from '@/lib/zoho';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const items = await fetchAllActiveItems();

        return NextResponse.json(items);
    } catch (error) {
        console.error('API /zoho/items error:', error);
        return NextResponse.json({ error: 'Internal server error while fetching items' }, { status: 500 });
    }
}
