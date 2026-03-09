import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Order from '@/models/Order';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        const searchParams = request.nextUrl.searchParams;
        const fromDateStr = searchParams.get('fromDate');
        const toDateStr = searchParams.get('toDate');
        const limitParam = searchParams.get('limit');

        const warehouseParam = searchParams.get('warehouse');

        const query: any = {
            $or: [
                { 'shipments.waybill': { $exists: true, $ne: '' } },
                { 'waybill': { $exists: true, $ne: '' } },
                { selfShipped: true },
                { status: 'SELF_SHIPPED' },
                { 'shipments.vendor': 'SELF' }
            ]
        };

        if (warehouseParam && warehouseParam !== 'all') {
            query['shipments.warehouse'] = warehouseParam;
        }

        if (fromDateStr || toDateStr) {
            query.createdAt = {};
            if (fromDateStr) {
                // from local YYYY-MM-DD start of day
                const fromDate = new Date(fromDateStr);
                fromDate.setHours(0, 0, 0, 0);
                query.createdAt.$gte = fromDate;
            }
            if (toDateStr) {
                // to local YYYY-MM-DD end of day
                const toDate = new Date(toDateStr);
                toDate.setHours(23, 59, 59, 999);
                query.createdAt.$lte = toDate;
            }
        }

        // Determine limit
        let limit = 10;
        if (limitParam === 'all') {
            limit = 0; // 0 means no limit in mongoose
        } else if (limitParam) {
            limit = parseInt(limitParam, 10);
        } else if (fromDateStr || toDateStr) {
            limit = 50;
        }

        // Fetch orders with waybills
        let orderQuery = Order.find(query).sort({ createdAt: -1 });
        if (limit > 0) {
            orderQuery = orderQuery.limit(limit);
        }
        const ordersWithWaybills = await orderQuery.lean();

        // Map to a cleaner format expected by tracking UI
        const mappedOrders = ordersWithWaybills.map((order: any) => {
            // Get the primary waybill (either top-level or first shipment's waybill)
            const waybill = order.waybill || (order.shipments && order.shipments.length > 0 ? order.shipments[0].waybill : '');

            // Determine real orderId for linking
            const realOrderId = order.orderId || order._id.toString();

            // Determine if self shipped
            const isSelfShipped = order.selfShipped === true ||
                order.status === 'SELF_SHIPPED' ||
                (order.shipments && order.shipments.some((s: any) => s.vendor === 'SELF'));

            return {
                _id: order._id,
                waybill: waybill,
                orderId: realOrderId,
                customerName: order.customerDetails?.customer_name || 'Unknown',
                status: order.status || 'SHIPPED',
                createdAt: order.createdAt,
                isSelfShipped,
                selfShipmentStatus: order.selfShipmentStatus || 'Order Created',
                selfShipmentNotes: order.selfShipmentNotes || '',
                invoiceItems: order.invoiceItems || [],
            };
        }).filter(o => o.waybill || o.isSelfShipped);

        return NextResponse.json({
            success: true,
            waybills: mappedOrders
        });

    } catch (error) {
        console.error('Error fetching tracked orders:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch tracked orders from database' },
            { status: 500 }
        );
    }
}
