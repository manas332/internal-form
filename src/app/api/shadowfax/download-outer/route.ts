import { NextRequest, NextResponse } from 'next/server';
import Order from '@/models/Order';
import fs from 'fs';
import path from 'path';
import { withDb } from '@/lib/api-handler';
import * as XLSX from 'xlsx';

export const GET = withDb(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const startStr = searchParams.get('start');
  const endStr = searchParams.get('end');

  let query: any = { status: 'SHADOWFAX_SCHEDULED', 'shipments.deliveryPartner': 'Shadowfax' };

  if (startStr && endStr) {
    query.updatedAt = {
      $gte: new Date(startStr),
      $lte: new Date(endStr)
    };
  }

  const orders = await Order.find(query).lean();

  const vendorsPath = path.join(process.cwd(), 'vendors.json');
  let vendorsData: any[] = [];
  try {
    const rawVendors = fs.readFileSync(vendorsPath, 'utf-8');
    vendorsData = JSON.parse(rawVendors);
  } catch (err) {
    console.error('Error reading vendors.json', err);
  }

  const getVendorDetails = (vendorName: string) => {
    const vendor = vendorsData.find(v => v.facility_name.toLowerCase() === vendorName.toLowerCase());
    return vendor || { facility_name: vendorName, address_line: '', pincode: '', phone: '' };
  };

  const headers = [
    'customerReference number',
    'consingment number',
    'consingment type',
    'origin-pincode',
    'origin-address-line-1',
    'line-2',
    'origin name',
    'origin phone',
    'destination name',
    'destination addr line 1',
    'line2',
    'destination phone',
    'destination pincode',
    'weight',
    'courier type',
    'content-type',
    'Declared price',
    'lenngth',
    'width',
    'height',
    'eway bill',
    'cod amount',
    'inFavourOf',
    'cod mode'
  ];

  const groupedRows: Record<string, any[][]> = {};

  for (const order of orders) {
    const sfShipments = (order.shipments || []).filter((s: any) => s.deliveryPartner === 'Shadowfax');

    for (const shipment of sfShipments) {
      const vendorName = shipment.vendor || shipment.warehouse || 'Unknown Vendor';
      const vDetails = getVendorDetails(vendorName);

      const paymentMode = shipment.paymentMode || order.paymentMode || 'Prepaid';

      let codAmountStr = '';
      let codModeStr = '';

      let defaultAmt = order.invoiceTotal || 0;
      let declaredPriceStr = `${defaultAmt}`;

      if (paymentMode === 'COD') {
        let amt = shipment.codAmount;
        if (amt === undefined || amt === null || amt === '') {
          amt = defaultAmt;
        }
        codAmountStr = `${amt}`;
        codModeStr = 'CASH';
      }

      const destAddress = `${order.customerDetails.address || ''}, ${order.customerDetails.city || ''}, ${order.customerDetails.state || ''}`;

      const originName = 'DA Dharm Sathi Pvt. Ltd.';
      const isOffice = vendorName.toLowerCase() === 'office';
      const originAddressLine = isOffice ? 'Greater Noida' : vDetails.address_line;
      const originPincode = isOffice ? '201301' : vDetails.pincode;

      const row = [
        order.orderId || '',
        shipment.waybill || '',
        'Reverse',
        originPincode || '',
        originAddressLine || '',
        '',
        originName,
        vDetails.phone || '',
        order.customerDetails.customer_name || '',
        destAddress,
        '',
        order.customerDetails.phone || '',
        order.customerDetails.pincode || '',
        '0.5',
        'non-document',
        'order',
        declaredPriceStr,
        '10',
        '10',
        '10',
        '',
        codAmountStr,
        '',
        codModeStr
      ];

      if (!groupedRows[vendorName]) {
        groupedRows[vendorName] = [headers];
      }
      groupedRows[vendorName].push(row);
    }
  }

  const wb = XLSX.utils.book_new();

  const vendorNames = Object.keys(groupedRows);
  if (vendorNames.length === 0) {
    const emptySheet = XLSX.utils.aoa_to_sheet([headers]);
    XLSX.utils.book_append_sheet(wb, emptySheet, 'No Data');
  } else {
    for (const vendor of vendorNames) {
      const sheetName = vendor.replace(/[\/\\?*\[\]:]/g, '').substring(0, 31);
      const ws = XLSX.utils.aoa_to_sheet(groupedRows[vendor]);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Shadowfax_Outer_${new Date().toISOString().split('T')[0]}.xlsx"`,
    },
  });
});
