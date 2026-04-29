import { NextResponse } from 'next/server';
import { fetchTaxes } from '@/lib/zoho';

export async function GET() {
  try {
    const res = await fetchTaxes();
    return NextResponse.json(res);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
