import { fetchItems } from '@/lib/zoho';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const { status, data } = await fetchItems();

        if (status !== 200) {
            return NextResponse.json({ error: 'Failed to fetch items from Zoho' }, { status });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('API /zoho/items error:', error);
        return NextResponse.json({ error: 'Internal server error while fetching items' }, { status: 500 });
    }
}
