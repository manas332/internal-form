import { NextRequest } from 'next/server';
import { generateAWB } from '@/lib/shadowfax';
import { withError, success, fail } from '@/lib/api-handler';

export const POST = withError(async (request: NextRequest) => {
  const body = await request.json();
  const count = body.count || 1;

  console.log("body",body)

  const { status, data } = await generateAWB(count);
  if (status !== 200) {
    return fail(data?.error || 'Shadowfax AWB generation failed', status);
  }

  return success({ awbs: data.awb_numbers || [] });
});
