/**
 * Fetch label data from Delhivery (pdf=false, JSON mode) and print a
 * clean custom label — no seller address, no return address, no price.
 *
 * When pdf=false, Delhivery returns the raw label data as JSON so it can
 * be rendered into a custom HTML layout.
 */
export async function printDelhiveryLabel(waybill: string): Promise<void> {
  const res = await fetch(`/api/delhivery/label?waybill=${waybill}&pdf_size=A4`);
  if (!res.ok) throw new Error('Failed to fetch label data');
  const data = await res.json();

  // Delhivery's pdf=false response can vary in structure — handle all cases
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pkg: Record<string, any> = {};
  if (Array.isArray(data) && data.length > 0) {
    pkg = data[0];
  } else if (data?.packages && Array.isArray(data.packages) && data.packages.length > 0) {
    pkg = data.packages[0];
  } else if (data && typeof data === 'object') {
    pkg = data;
  }

  // Helper: try multiple possible field names in order
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const val = pkg[k];
      if (val !== undefined && val !== null && String(val).trim()) {
        return String(val).trim();
      }
    }
    return '';
  };

  const awb = get('waybill', 'awb', 'AWB', 'wbn') || waybill;
  const consigneeName = get('consignee_name', 'name', 'to_name', 'customer_name', 'Consignee');
  const consigneeAddress = get('consignee_address', 'add', 'to_add', 'address');
  const consigneeCity = get('consignee_city', 'city', 'to_city', 'City');
  const consigneeState = get('consignee_state', 'state', 'to_state', 'State');
  const consigneePin = get('consignee_pin', 'pin', 'to_pin', 'pincode');
  const sortCode = get('sort_code', 'SortCode', 'sort_hub', 'destination_hub', 'dst');
  const orderId = get('refnum', 'order', 'reference_number', 'ref_id', 'order_id', 'ref');
  const paymentType = get('payment', 'payment_mode', 'PaymentType', 'pt');
  const serviceType = get('service_type', 'shipping_mode', 'ServiceType', 'md');

  const dateStr = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    hour12: true,
  });

  // Fetch and embed the logo as a base64 data URI so it renders correctly
  // in the detached print popup window (which can't load relative URLs)
  let logoDataUri = '';
  try {
    const logoRes = await fetch('/delhivery-logo.png');
    if (logoRes.ok) {
      const blob = await logoRes.blob();
      logoDataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // If logo load fails, fall back to text
  }

  const logoHtml = logoDataUri
    ? `<img class="logo" src="${logoDataUri}" alt="Delhivery" />`
    : `<span style="font-size:22px;font-weight:900;letter-spacing:2px;">DELHIVERY</span>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Shipping Label \u2013 ${awb}</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #000; padding: 12px; }
  /* Label takes half the page width, anchored top-left */
  .label { width: 50%; border: 2px solid #000; float: left; }
  .header { display: flex; justify-content: space-between; align-items: center;
            border-bottom: 2px solid #000; padding: 6px 12px; }
  .sort-code { font-size: 14px; font-weight: bold; letter-spacing: 1px; }
  .logo { height: 48px; width: auto; object-fit: contain; }
  .awb-row { padding: 8px 12px 2px; font-size: 13px; font-weight: bold; }
  .barcode-section { text-align: center; padding: 2px 12px 4px; }
  .barcode-section svg { max-width: 100%; }
  .sort-bar { display: flex; justify-content: space-between;
              border-top: 2px solid #000; border-bottom: 2px solid #000;
              padding: 5px 12px; font-size: 12px; font-weight: bold; }
  .ship-info { display: grid; grid-template-columns: 3fr 2fr; }
  .ship-to { padding: 10px 12px; border-right: 2px solid #000; }
  .ship-to-label { font-size: 12px; color: #333; }
  .consignee-name { font-size: 16px; font-weight: bold; margin: 3px 0 4px; }
  .consignee-address { font-size: 11px; line-height: 1.45; margin-bottom: 6px; }
  .consignee-city { font-size: 13px; font-weight: bold; }
  .consignee-pin { font-size: 13px; font-weight: bold; margin-top: 2px; }
  .meta { padding: 10px 12px; }
  .meta-group { margin-bottom: 10px; }
  .meta-label { font-size: 10px; color: #555; }
  .meta-val { font-size: 12px; font-weight: bold; }
  .order-section { padding: 10px 12px; border-top: 2px solid #000; }
  .order-id-text { font-size: 13px; font-weight: bold; margin-bottom: 4px; }
  .footer { padding: 4px 12px; text-align: right; font-size: 10px; color: #555;
            border-top: 1px solid #ccc; }
  @media print {
    body { padding: 0; }
    @page { margin: 8mm; }
  }
</style>
</head>
<body>
<div class="label">
  <div class="header">
    <span class="sort-code">${sortCode}</span>
    ${logoHtml}
  </div>
  <div class="awb-row">AWB# ${awb}</div>
  <div class="barcode-section"><svg id="awb-barcode"></svg></div>
  <div class="sort-bar">
    <span>${consigneePin}</span>
    <span>AWB# ${awb}</span>
    <span>${sortCode}</span>
  </div>
  <div class="ship-info">
    <div class="ship-to">
      <span class="ship-to-label">Ship to \u2013 </span>
      <div class="consignee-name">${consigneeName}</div>
      <div class="consignee-address">${consigneeAddress}${consigneeCity || consigneeState ? ', ' + [consigneeCity, consigneeState].filter(Boolean).join(', ') : ''}</div>
      <div class="consignee-city">${consigneeCity}${consigneeState ? ' (' + consigneeState + ')' : ''}</div>
      <div class="consignee-pin">PIN \u2013 ${consigneePin}</div>
    </div>
    <div class="meta">
      ${paymentType ? `<div class="meta-group">
        <div class="meta-label">${serviceType ? serviceType + ' \u2013 ' : ''}${paymentType}</div>
      </div>` : ''}
      <div class="meta-group">
        <div class="meta-label">Date</div>
        <div class="meta-val">${dateStr}</div>
      </div>
    </div>
  </div>
  ${orderId ? `<div class="order-section">
    <div class="order-id-text">${orderId}</div>
    <div class="barcode-section" style="text-align:left;padding-left:0"><svg id="order-barcode"></svg></div>
  </div>` : ''}
  <div class="footer">Page 1 of 1</div>
</div>
<script>
  window.onload = function() {
    try {
      JsBarcode('#awb-barcode', '${awb}', {
        format: 'CODE128', width: 2, height: 60, displayValue: false
      });
    } catch(e) { console.error('AWB barcode error:', e); }
    ${orderId ? `try {
      JsBarcode('#order-barcode', '${orderId}', {
        format: 'CODE128', width: 1.5, height: 40, displayValue: false
      });
    } catch(e) { console.error('Order barcode error:', e); }` : ''}
    setTimeout(function() { window.print(); }, 600);
  };
<\/script>
</body>
</html>`;

  const printWindow = window.open('', '_blank', 'width=794,height=1123');
  if (!printWindow) throw new Error('Popup blocked. Please allow popups for this site and try again.');
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
