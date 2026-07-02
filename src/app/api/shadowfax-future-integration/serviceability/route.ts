import { NextRequest } from 'next/server';
import { checkServiceability, ServiceabilityParams } from '@/lib/shadowfax';
import { withError, success, fail } from '@/lib/api-handler';

export const GET = withError(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const service = searchParams.get('service') || 'customer_delivery';
  const pincodes = searchParams.get('pincodes') || '';
  const page = searchParams.get('page');
  const count = searchParams.get('count');

  const validServices = ['seller_pickup', 'customer_delivery', 'customer_pickup', 'seller_delivery', 'warehouse_pickup', 'warehouse_return'];
  if (!validServices.includes(service)) {
    return fail(`Invalid service. Must be one of: ${validServices.join(', ')}`, 400);
  }

  const params: ServiceabilityParams = { service: service as ServiceabilityParams['service'] };
  if (pincodes) params.pincodes = pincodes;
  if (page) params.page = parseInt(page, 10);
  if (count) params.count = parseInt(count, 10);

  const { status, data } = await checkServiceability(params);
  if (status !== 200) {
    return fail(data?.error || 'Shadowfax serviceability check failed', status);
  }

  return success({ data });
});
