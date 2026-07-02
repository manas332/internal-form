import { NextRequest } from 'next/server';
import { createShipment } from '@/lib/shadowfax';
import { withError, success, fail } from '@/lib/api-handler';

export const POST = withError(async (request: NextRequest) => {
  const body = await request.json();

  if (!body.order_type || body.order_type !== 'warehouse') {
    return fail('Missing or invalid order_type (must be "warehouse")', 400);
  }
  if (!body.order_details?.client_order_id) {
    return fail('Missing order_details.client_order_id', 400);
  }
  if (!body.order_details?.awb_number) {
    return fail('Missing order_details.awb_number', 400);
  }
  if (!body.customer_details || !body.pickup_details || !body.rto_details) {
    return fail('Missing customer_details, pickup_details, or rto_details', 400);
  }
  if (!body.product_details || !Array.isArray(body.product_details) || body.product_details.length === 0) {
    return fail('Missing or empty product_details array', 400);
  }

  const { status, data } = await createShipment(body);
  if (status !== 200 && status !== 201) {
    return fail(data?.error || 'Shadowfax shipment creation failed', status);
  }

  return success({ data });
});
