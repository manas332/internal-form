import { NextRequest } from 'next/server';
import { trackShipment, trackMultipleShipments } from '@/lib/shadowfax';
import { withError, success, fail } from '@/lib/api-handler';

export const GET = withError(async (request: NextRequest, { params }: { params: Promise<{ clientOrderId: string }> }) => {
  const { clientOrderId } = await params;

  if (!clientOrderId) {
    return fail('Missing AWB number', 400);
  }

  const { status, data } = await trackShipment(clientOrderId);
  if (status !== 200) {
    return fail(data?.error || 'Shadowfax tracking failed', status);
  }

  return success({ data });
});

export const POST = withError(async (request: NextRequest) => {
  const body = await request.json();
  const awbNumbers = body.awb_numbers;

  if (!Array.isArray(awbNumbers) || awbNumbers.length === 0) {
    return fail('Missing awb_numbers array', 400);
  }

  if (awbNumbers.length > 50) {
    return fail('Max 50 AWBs allowed per request', 400);
  }

  const { status, data } = await trackMultipleShipments(awbNumbers);
  if (status !== 200) {
    return fail(data?.error || 'Shadowfax bulk tracking failed', status);
  }

  return success({ data });
});
