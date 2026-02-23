import { NextRequest, NextResponse } from 'next/server';
import { checkPincodeServiceability } from '@/lib/delhivery';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const code = searchParams.get('code');

        if (!code) {
            return NextResponse.json({ error: 'code query parameter is required' }, { status: 400 });
        }

        const data = await checkPincodeServiceability(code);
        return NextResponse.json(data);
    } catch (error) {
        console.error('Pincode serviceability error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to check pincode' },
            { status: 500 }
        );
    }
}
