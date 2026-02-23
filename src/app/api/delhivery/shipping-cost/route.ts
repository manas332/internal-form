import { NextRequest, NextResponse } from 'next/server';
import { calculateShippingCost } from '@/lib/delhivery';
import { ShippingCostParams } from '@/types/delhivery';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const md = searchParams.get('md') as 'E' | 'S';
        const cgm = Number(searchParams.get('cgm'));
        const o_pin = Number(searchParams.get('o_pin'));
        const d_pin = Number(searchParams.get('d_pin'));
        const ss = searchParams.get('ss') as 'Delivered' | 'RTO' | 'DTO';
        const pt = searchParams.get('pt') as 'Pre-paid' | 'COD';
        const l = searchParams.has('l') ? Number(searchParams.get('l')) : undefined;
        const b = searchParams.has('b') ? Number(searchParams.get('b')) : undefined;
        const h = searchParams.has('h') ? Number(searchParams.get('h')) : undefined;
        const ipkg_type = searchParams.get('ipkg_type') || undefined;

        if (!md || !cgm || !o_pin || !d_pin || !ss || !pt) {
            return NextResponse.json(
                { error: 'md, cgm, o_pin, d_pin, ss, and pt are required parameters' },
                { status: 400 }
            );
        }

        const params: ShippingCostParams = { md, cgm, o_pin, d_pin, ss, pt, l, b, h, ipkg_type };
        const { status, data } = await calculateShippingCost(params);

        return NextResponse.json(data, { status });
    } catch (error) {
        console.error('Calculate shipping cost error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to calculate shipping cost' },
            { status: 500 }
        );
    }
}
