import { NextRequest, NextResponse } from 'next/server';
import Order from '@/models/Order';
import fs from 'fs';
import path from 'path';
import { withDb, success, fail } from '@/lib/api-handler';

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
    'Order Id', 'AWB', 'Pickup type', 'Pickup Name', 'Pickup Contact',
    'Pickup Address Line 1', 'Pickup Address Line 2', 'Pickup City', 'Pickup State', 'Pickup Pincode',
    'Customer Name', 'Customer Contact', 'Alternate Customer Contact',
    'Customer Address Line 1', 'Customer Address Line 2', 'Customer City', 'Customer State', 'Customer Pincode',
    'Promised Delivery Date', 'Quantity', 'Actual Weight', 'Volumetric Weight',
    'Declared Value', 'Total Amount', 'Cod Amount',
    'SKU', 'Product Name', 'Price', 'Category', 'Brand',
    'Seller Name', 'Seller Address', 'Seller State',
    'GSTIN Number', 'HSN Code', 'Invoice No',
    'SGST', 'IGST', 'CGST', 'Total Tax',
    'Delivery Type', 'Remarks',
    'Return Name', 'Return Address Line 1', 'Return Address Line 2',
    'Return City', 'Return State', 'Return Pincode', 'Return Contact',
    'E-Way Bill', 'Order Service', 'Reseller Name'
  ];

  const groupedRows: Record<string, string[]> = {};

  for (const order of orders) {
    const sfShipments = (order.shipments || []).filter((s: any) => s.deliveryPartner === 'Shadowfax');

    for (const shipment of sfShipments) {
      const vendorName = shipment.vendor || shipment.warehouse || 'Unknown Vendor';
      const vDetails = getVendorDetails(vendorName);

      let totalAmount = 0;
      let totalQty = 0;
      let hsnCodes: string[] = [];
      if (order.invoiceItems && order.invoiceItems.length > 0) {
        for (const item of shipment.items) {
          const baseItem = order.invoiceItems[item.lineIndex];
          if (baseItem) {
            const qty = item.quantity || baseItem.quantity || 1;
            totalQty += qty;
            const perUnit = baseItem.final_price ?? (((baseItem.item_total || 0) + (baseItem.tax_amount || 0)) / (baseItem.quantity || 1));
            totalAmount += perUnit * qty;
            if (baseItem.hsn_or_sac) hsnCodes.push(baseItem.hsn_or_sac);
          }
        }
      }
      const paymentMode = shipment.paymentMode || order.paymentMode || 'Prepaid';

      let codAmountStr = '';
      let defaultAmt = totalAmount > 0 ? totalAmount : (order.invoiceTotal || 0);
      let declaredPriceStr = `${defaultAmt}`;

      if (paymentMode === 'COD') {
        let amt = shipment.codAmount ?? defaultAmt;
        codAmountStr = `${amt}`;
        declaredPriceStr = `${amt}`;
      }

      const row = [
        order.orderId || '',
        shipment.waybill || '',
        'Seller',
        vDetails.facility_name || '',
        vDetails.phone || '',
        vDetails.address_line || '',
        '',
        '',
        '',
        vDetails.pincode || '',
        order.customerDetails?.customer_name || '',
        order.customerDetails?.phone || '',
        '',
        order.customerDetails?.address || '',
        '',
        order.customerDetails?.city || '',
        order.customerDetails?.state || '',
        order.customerDetails?.pincode || '',
        '',
        String(totalQty),
        '',
        '',
        declaredPriceStr,
        String(defaultAmt),
        codAmountStr,
        '',
        '',
        '',
        '',
        '',
        'DA Dharm Sathi Pvt Ltd',
        'Noida, Uttar Pradesh',
        'Uttar Pradesh',
        '',
        hsnCodes.join(' | '),
        order.orderId || '',
        '',
        '',
        '',
        '',
        paymentMode === 'COD' ? 'COD' : 'Prepaid',
        '',
        'DA Dharm Sathi Pvt Ltd',
        'Noida, Uttar Pradesh',
        '',
        'Noida',
        'Uttar Pradesh',
        '201301',
        '9999999999',
        '',
        '',
        ''
      ];

      const rowLine = row.join(',');

      if (!groupedRows[vendorName]) {
        groupedRows[vendorName] = [headers.join(',')];
      }
      groupedRows[vendorName].push(rowLine);
    }
  }

  const filesData = Object.keys(groupedRows).map(vendor => ({
    filename: `Shadowfax_${vendor.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`,
    content: groupedRows[vendor].join('\n')
  }));

  return success({ files: filesData });
});
