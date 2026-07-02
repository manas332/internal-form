import { NextRequest } from 'next/server';
import { updateOrder } from '@/lib/shadowfax';
import { withError, success, fail } from '@/lib/api-handler';

export const POST = withError(async (request: NextRequest) => {
  const body = await request.json();

  if (!body.awb_number) {
    return fail('Missing awb_number', 400);
  }

  const { status, data } = await updateOrder(body);
  if (status !== 200) {
    return fail(data?.error || data?.message || 'Shadowfax order update failed', status);
  }

  return success({ data });
});
