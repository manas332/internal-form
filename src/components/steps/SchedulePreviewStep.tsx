'use client';

import { useMemo, useState, useCallback } from 'react';
import { useWizardStore } from '@/store/wizardStore';
import { CombinedFormData } from '@/types/wizard';
import type { PlannedShipment } from '@/components/shipment/types';
import { isSelfShipment } from '@/components/shipment/types';
import { ShipmentForm } from '@/components/shipment/ShipmentForm';
import { ItemAllocationTable } from '@/components/shipment/ItemAllocationTable';
import { ShipmentEstimates } from '@/components/shipment/ShipmentEstimates';
import { AddShipmentButtons } from '@/components/shipment/AddShipmentButtons';
import { useShipmentEstimates } from '@/hooks/useShipmentEstimates';
import { useOrderUpdate } from '@/hooks/useOrderUpdate';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBox } from '@/components/ui/ErrorBox';
import { delhiveryService } from '@/services/delhivery';

const DELIVERY_PARTNER_OPTIONS = [
  { value: 'Delhivery', label: 'Delhivery' },
  { value: 'DTDC', label: 'DTDC' },
  { value: 'Shadowfax', label: 'Shadowfax' },
];

function defaultShipment(formData: CombinedFormData): PlannedShipment {
  return {
    id: 'shipment-1',
    vendor: formData.warehouse as string,
    deliveryPartner: 'Delhivery',
    warehouse: formData.warehouse as string,
    items: formData.invoice_items.map((_, idx) => ({ lineIndex: idx, quantity: _.quantity })),
    isSelfShipment: false,
    shipping_mode: formData.shipping_mode || 'Surface',
    payment_mode: formData.payment_mode || 'Prepaid',
    fragile: formData.fragile || false,
    weight: formData.weight || 200,
    length: formData.length || 10,
    width: formData.width || 10,
    height: formData.height || 10,
    products_desc: formData.products_desc || '',
    cod_amount: undefined,
    provider: '',
    awb: '',
  };
}

function hydrateShipment(sh: PlannedShipment, formData: CombinedFormData): PlannedShipment {
  return {
    ...sh,
    shipping_mode: sh.shipping_mode || formData.shipping_mode || 'Surface',
    payment_mode: sh.payment_mode || formData.payment_mode || 'Prepaid',
    fragile: sh.fragile ?? formData.fragile ?? false,
    weight: sh.weight ?? formData.weight ?? 200,
    length: sh.length ?? formData.length ?? 10,
    width: sh.width ?? formData.width ?? 10,
    height: sh.height ?? formData.height ?? 10,
    products_desc: sh.products_desc ?? formData.products_desc ?? '',
    provider: sh.provider ?? '',
    awb: sh.awb ?? '',
  };
}

function applyShipmentUpdate(
  prev: PlannedShipment[],
  id: string,
  updates: Partial<PlannedShipment>
): PlannedShipment[] {
  return prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
}

export default function SchedulePreviewStep() {
    const formData = useWizardStore((s) => s.formData);
    const updateForm = useWizardStore((s) => s.updateForm);
    const nextStep = useWizardStore((s) => s.nextStep);
    const prevStep = useWizardStore((s) => s.prevStep);

  const [plannedShipments, setPlannedShipments] = useState<PlannedShipment[]>(() =>
    formData.plannedShipments && formData.plannedShipments.length > 0
      ? formData.plannedShipments.map((sh) => hydrateShipment(sh as PlannedShipment, formData))
      : [defaultShipment(formData)]
  );

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const estimateInputs = useMemo(
    () =>
      plannedShipments.map((s) => ({
        id: s.id,
        shipping_mode: s.shipping_mode,
        weight: s.weight,
        payment_mode: s.payment_mode,
        warehouse: s.warehouse,
      })),
    [plannedShipments]
  );

  const { costs: shippingCosts, tats: expectedTats, loading: loadingPreview } = useShipmentEstimates({
    plannedShipments: estimateInputs,
    destPincode: formData.pincode,
  });

  const { updateOrder } = useOrderUpdate();

  const getAllocatedQtyForLine = useCallback(
    (lineIndex: number) =>
      plannedShipments.reduce((sum, sh) => {
        const found = sh.items.find((it) => it.lineIndex === lineIndex);
        return sum + (found?.quantity || 0);
      }, 0),
    [plannedShipments]
  );

  const updateShipment = (id: string, updates: Partial<PlannedShipment>) =>
    setPlannedShipments((prev) => applyShipmentUpdate(prev, id, updates));

  const updateShipmentItemQty = (shipmentId: string, lineIndex: number, quantity: number) =>
    setPlannedShipments((prev) =>
      prev.map((sh) => {
        if (sh.id !== shipmentId) return sh;
        const items = [...sh.items];
        const idx = items.findIndex((it) => it.lineIndex === lineIndex);
        if (idx >= 0) items[idx] = { ...items[idx], quantity };
        else items.push({ lineIndex, quantity });
        return { ...sh, items };
      })
    );

  const addShipment = (kind: 'DELHIVERY' | 'SELF' | 'DTDC' | 'SHADOWFAX') =>
    setPlannedShipments((prev) => [
      ...prev,
      {
        ...defaultShipment(formData),
        id: `shipment-${prev.length + 1}`,
        deliveryPartner: kind === 'SELF' ? 'SELF' : kind === 'DTDC' ? 'DTDC' : kind === 'SHADOWFAX' ? 'Shadowfax' : 'Delhivery',
        items: formData.invoice_items.map((_, idx) => ({ lineIndex: idx, quantity: 0 })),
        isSelfShipment: kind === 'SELF',
      },
    ]);

  const removeShipment = (id: string) =>
    setPlannedShipments((prev) => prev.filter((s) => s.id !== id));

  const saveWaybillToHistory = (waybill: string, orderId: string, consignee: string) => {
    try {
      const history = JSON.parse(localStorage.getItem('delhivery_recent_orders') || '[]');
      localStorage.setItem(
        'delhivery_recent_orders',
        JSON.stringify([{ waybill, orderId, consignee, date: new Date().toISOString() }, ...history].slice(0, 5))
      );
    } catch { /* ignore */ }
  };

  const subtotal = formData.invoice_items.reduce((acc, item) => acc + (item.item_total || 0), 0);
  const totalTax = formData.invoice_items.reduce((acc, item) => acc + (item.tax_amount || 0), 0);
  const finalItemsPrice = subtotal + totalTax;
  const appliedDiscount = (Number(formData.discount) || 0) * (formData.discount_format_type === 'percentage' ? finalItemsPrice / 100 : 1);
  const grandTotal = finalItemsPrice - appliedDiscount + (formData.include_shipping ? 100 : 0) + (formData.include_cod ? 50 : 0);

  const handleConfirm = async () => {
    setSubmitting(true);
    setErrorMsg('');

    try {
      if (!formData.orderId) throw new Error('Missing Order ID');

      formData.invoice_items.forEach((item, idx) => {
        const allocated = getAllocatedQtyForLine(idx);
        if (allocated > item.quantity)
          throw new Error(`Item ${idx + 1} allocation exceeds quantity (${allocated}/${item.quantity}).`);
      });

      plannedShipments.forEach((sh, i) => {
        if (isSelfShipment(sh)) {
          if (!sh.provider) throw new Error(`Shipment ${i + 1}: Shipping Provider is required`);
          if (!sh.awb?.trim()) throw new Error(`Shipment ${i + 1}: AWB is required`);
          return;
        }
        if (sh.deliveryPartner === 'DTDC' || sh.deliveryPartner === 'Shadowfax') return;
        const eff = sh.items.filter((it) => it.quantity > 0);
        if (eff.length === 0) return;
        if (!sh.weight || sh.weight <= 0) throw new Error(`Shipment ${i + 1}: Weight must be > 0`);
        if (!sh.products_desc?.trim()) throw new Error(`Shipment ${i + 1}: Description is required`);
      });

      interface CreatedShipment {
        vendor: string; deliveryPartner?: string; waybill?: string; shippingCost: number;
        warehouse: string; paymentMode?: string; codAmount?: number;
        items: { lineIndex: number; quantity: number }[];
      }

      const createdShipmentsForOrder: CreatedShipment[] = [];
      const allWaybills: string[] = [];

      const delhiveryShipments = plannedShipments
        .map((sh, i) => ({ sh, i }))
        .filter(({ sh }) => !isSelfShipment(sh) && sh.deliveryPartner !== 'DTDC' && sh.deliveryPartner !== 'Shadowfax');

      for (const { sh, i } of delhiveryShipments) {
        const eff = sh.items.filter((it) => it.quantity > 0);
        if (eff.length === 0) continue;

        let amount = 0;
        eff.forEach((it) => {
          const base = formData.invoice_items[it.lineIndex];
          const pu = ((base.item_total || 0) + (base.tax_amount || 0)) / (base.quantity || 1);
          amount += pu * it.quantity;
        });

        const phone = (formData.phone || '').replace(/\D/g, '').slice(-10);
        const payload = {
          name: formData.customer_name,
          add: formData.phone ? `${formData.address}, Ph: ${formData.country_code} ${formData.phone}` : formData.address,
          pin: parseInt(formData.pincode, 10),
          city: formData.city, state: formData.state, country: formData.country,
          phone,
          order: `${formData.orderId}-PKG${i + 1}`,
          payment_mode: sh.payment_mode,
          total_amount: Number((amount || grandTotal).toFixed(2)),
          cod_amount: sh.payment_mode === 'COD' ? Number(sh.cod_amount ?? Number((amount || grandTotal).toFixed(2))) : 0,
          products_desc: sh.products_desc || 'Spiritual Items',
          quantity: '1',
          pickup_location: sh.warehouse || (formData.warehouse as string),
          shipment_length: sh.length || 0,
          shipment_width: sh.width || 0,
          shipment_height: sh.height || 0,
          fragile_shipment: sh.fragile ? 'true' : 'false',
          shipping_mode: sh.shipping_mode,
        };

        const res = await delhiveryService.createShipment(payload);
        const result = res.results?.[0];
        const data = result?.data as Record<string, unknown> | undefined;

        if (!result || result.status !== 200 || !data?.success) {
          const pkgs = data?.packages as Record<string, unknown>[] | undefined;
          const err = (data?.rmk as string) || (data?.error as string) || (pkgs?.[0]?.remarks as string) || 'Failed';
          throw new Error(`Shipment ${i + 1} Failed: ${err}`);
        }

        const pkgs = data?.packages as Record<string, unknown>[] | undefined;
        const wb = pkgs?.[0]?.waybill as string | undefined;
        if (wb) {
          allWaybills.push(wb);
          saveWaybillToHistory(wb, formData.orderId ?? '', formData.customer_name ?? '');
        }

        createdShipmentsForOrder.push({
          vendor: sh.warehouse || sh.vendor || 'DELHIVERY',
          deliveryPartner: 'Delhivery',
          waybill: wb,
          shippingCost: shippingCosts[sh.id] || 0,
          warehouse: sh.warehouse || (formData.warehouse as string),
          paymentMode: sh.payment_mode || 'Prepaid',
          codAmount: payload.cod_amount || undefined,
          items: eff,
        });
      }

      for (const sh of plannedShipments.filter((s) => s.deliveryPartner === 'DTDC')) {
        const eff = sh.items.filter((it) => it.quantity > 0);
        if (eff.length === 0) continue;
        createdShipmentsForOrder.push({
          vendor: sh.warehouse || sh.vendor,
          deliveryPartner: 'DTDC',
          waybill: sh.awb || undefined,
          shippingCost: 0,
          warehouse: sh.warehouse || (formData.warehouse as string),
          paymentMode: sh.payment_mode || 'Prepaid',
          codAmount: sh.payment_mode === 'COD' && sh.cod_amount !== undefined && sh.cod_amount !== '' ? Number(sh.cod_amount) : undefined,
          items: eff,
        });
      }

      for (const sh of plannedShipments.filter((s) => s.deliveryPartner === 'Shadowfax')) {
        const eff = sh.items.filter((it) => it.quantity > 0);
        if (eff.length === 0) continue;
        createdShipmentsForOrder.push({
          vendor: sh.warehouse || sh.vendor,
          deliveryPartner: 'Shadowfax',
          waybill: sh.awb || undefined,
          shippingCost: 0,
          warehouse: sh.warehouse || (formData.warehouse as string),
          paymentMode: sh.payment_mode || 'Prepaid',
          codAmount: sh.payment_mode === 'COD' && sh.cod_amount !== undefined && sh.cod_amount !== '' ? Number(sh.cod_amount) : undefined,
          items: eff,
        });
      }

      plannedShipments.forEach((sh) => {
        if (!isSelfShipment(sh)) return;
        const eff = sh.items.filter((it) => it.quantity > 0);
        if (eff.length === 0) return;
        createdShipmentsForOrder.push({
          vendor: 'SELF',
          deliveryPartner: sh.provider || 'SELF',
          waybill: sh.awb,
          shippingCost: 0,
          warehouse: sh.warehouse || (formData.warehouse as string),
          items: eff,
        });
      });

      if (createdShipmentsForOrder.length === 0)
        throw new Error('No shipment rows defined.');

      const shippedPerLine = formData.invoice_items.map(() => 0);
      createdShipmentsForOrder.forEach((s) => s.items.forEach((it) => { shippedPerLine[it.lineIndex] += it.quantity; }));

      let allDone = true;
      let anyDone = false;
      formData.invoice_items.forEach((item, idx) => {
        const q = shippedPerLine[idx];
        if (q > 0) anyDone = true;
        if (q < item.quantity) allDone = false;
      });

      let status = allDone ? 'SHIPPED' : anyDone ? 'PARTIALLY_SHIPPED' : 'PENDING_SHIPPING';
      if (createdShipmentsForOrder.some((s) => s.deliveryPartner === 'Shadowfax')) status = 'SHADOWFAX_SCHEDULED';
      else if (createdShipmentsForOrder.some((s) => s.deliveryPartner === 'DTDC')) status = 'DTDC_SCHEDULED';

      await updateOrder(formData.orderId, {
        status,
        selfShipped: plannedShipments.some((s) => isSelfShipment(s)),
        shipmentsAppend: createdShipmentsForOrder,
        waybill: allWaybills[0] ?? null,
        waybills: allWaybills,
        shippingCost: createdShipmentsForOrder.reduce((sum, s) => sum + (s.shippingCost || 0), 0),
      });

      updateForm({ waybill: allWaybills[0], waybills: allWaybills, plannedShipments });
      nextStep();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  };

  const anyDescriptions = useMemo(
    () => formData.invoice_items.some((it) => (it.description || '').trim().length > 0),
    [formData.invoice_items]
  );

  const perUnitTotal = (it: typeof formData.invoice_items[0]) =>
    it.final_price ?? (((it.item_total || 0) + (it.tax_amount || 0)) / (it.quantity || 1));

  return (
    <div className="form-section animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title mb-0">
          <span className="section-icon">🔍</span> Confirm Shipping
        </h3>
        <button className="btn btn-secondary py-1.5 px-4 text-sm font-semibold" onClick={prevStep} disabled={submitting}>
          🡨 Back
        </button>
      </div>

      <div className="mb-6 bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-2xl p-5 shadow-sm text-sm text-gray-700 dark:text-gray-300">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div><span className="font-semibold text-gray-500 dark:text-gray-400">Order ID:</span> {formData.orderId}</div>
          <div><span className="font-semibold text-gray-500 dark:text-gray-400">Customer:</span> {formData.customer_name}</div>
          <div><span className="font-semibold text-gray-500 dark:text-gray-400">Payment:</span> {formData.payment_mode || 'Prepaid'}</div>
        </div>
      </div>

      <ErrorBox message={errorMsg} onDismiss={() => setErrorMsg('')} />

      <div className="mb-6 bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-2xl p-5 shadow-sm">
        <h4 className="text-gray-900 dark:text-accent font-bold mb-4 border-b border-gray-100 dark:border-[#2a2a38] pb-3 flex items-center gap-2 text-lg">
          📦 Items in this Order
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#1c1c28] uppercase border-b border-gray-100 dark:border-[#2a2a38]">
              <tr>
                <th className="px-2 py-2 rounded-l-lg font-semibold">Item</th>
                {anyDescriptions && <th className="px-2 py-2 font-semibold">Description</th>}
                <th className="px-2 py-2 font-semibold text-center">Price</th>
                <th className="px-2 py-2 font-semibold text-center">Qty</th>
                <th className="px-2 py-2 font-semibold text-center">Total</th>
                <th className="px-2 py-2 rounded-r-lg font-semibold text-center">Allocated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a38]">
              {formData.invoice_items.map((it, idx) => (
                <tr key={idx} className="text-gray-700 dark:text-gray-300">
                  <td className="px-2 py-2.5 font-medium">{it.name}</td>
                  {anyDescriptions && (
                    <td className="px-2 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                      {(it.description || '').trim() || <span className="italic text-gray-400">—</span>}
                    </td>
                  )}
                  <td className="px-2 py-2.5 text-center">₹{perUnitTotal(it).toFixed(2)}</td>
                  <td className="px-2 py-2.5 text-center">{it.quantity}</td>
                  <td className="px-2 py-2.5 text-center font-medium">₹{(perUnitTotal(it) * it.quantity).toFixed(2)}</td>
                  <td className="px-2 py-2.5 text-center">
                    <span className={getAllocatedQtyForLine(idx) === it.quantity ? 'text-green-500' : 'text-orange-400'}>
                      {getAllocatedQtyForLine(idx)}/{it.quantity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-6 bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-4 border-b border-gray-100 dark:border-[#2a2a38] pb-3">
          <h4 className="text-gray-900 dark:text-accent font-bold flex items-center gap-2 text-lg mb-0">
            🧩 Split Shipments
          </h4>
          <AddShipmentButtons onAdd={addShipment} />
        </div>

        <div className="space-y-4">
          {plannedShipments.map((sh, idx) => (
            <div key={sh.id} className="border border-gray-100 dark:border-[#2a2a38] rounded-xl p-4 bg-gray-50 dark:bg-[#1c1c28]">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-300 font-semibold">
                    Shipment {idx + 1}
                  </span>
                  <span className={isSelfShipment(sh) ? 'badge badge-emerald' : 'badge badge-indigo'}>
                    {isSelfShipment(sh) ? 'SELF SHIPPED' : sh.deliveryPartner === 'Shadowfax' ? 'SHADOWFAX' : sh.deliveryPartner === 'DTDC' ? 'DTDC' : 'DELHIVERY'}
                  </span>
                </div>
                {plannedShipments.length > 1 && (
                  <button type="button" className="text-xs text-red-400 hover:underline" onClick={() => removeShipment(sh.id)}>
                    Remove
                  </button>
                )}
              </div>

              <ShipmentForm
                shipment={sh}
                index={idx}
                onChange={updateShipment}
                deliveryPartnerOptions={DELIVERY_PARTNER_OPTIONS}
                showPartnerSelector={!isSelfShipment(sh)}
              />

              {isSelfShipment(sh) && (
                <div className="form-grid-2 mt-3">
                  <div className="form-group">
                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1.5 text-sm">Shipping Provider *</label>
                    <select className="form-input" value={sh.provider || ''}
                      onChange={(e) => updateShipment(sh.id, { provider: e.target.value })}>
                      <option value="">Select Provider</option>
                      {['Shadowfax', 'DTDC', 'XpressBees', 'Delhivery', 'India Post'].map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1.5 text-sm">AWB Number *</label>
                    <input className="form-input" value={sh.awb || ''} placeholder="Enter AWB"
                      onChange={(e) => updateShipment(sh.id, { awb: e.target.value })} />
                  </div>
                </div>
              )}

              {(sh.deliveryPartner === 'DTDC' || sh.deliveryPartner === 'Shadowfax') && (
                <div className="form-grid-2 mt-3">
                  <div className="form-group">
                    <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1.5 text-sm">AWB Number (Optional)</label>
                    <input className="form-input" value={sh.awb || ''} placeholder={`Enter ${sh.deliveryPartner} AWB`}
                      onChange={(e) => updateShipment(sh.id, { awb: e.target.value })} />
                  </div>
                </div>
              )}

              <ItemAllocationTable
                items={formData.invoice_items}
                shipment={sh}
                onChangeQty={updateShipmentItemQty}
                getAllocatedQty={getAllocatedQtyForLine}
              />
            </div>
          ))}
        </div>
      </div>

      {loadingPreview ? (
        <Spinner text="Calculating shipping estimates & routing..." />
      ) : (
        <div className="w-full">
          <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-2xl p-6 shadow-sm">
            <h4 className="text-gray-900 dark:text-accent font-bold mb-5 border-b border-gray-100 dark:border-[#2a2a38] pb-3 flex items-center gap-2 text-lg">
              🚚 Shipping Routing ({formData.orderId})
            </h4>
            <div className="text-sm space-y-8 text-gray-600 dark:text-gray-300">
              {plannedShipments.map((sh, idx) => (
                <div key={sh.id} className="mb-6 p-4 rounded-xl border border-gray-200 dark:border-[#2a2a38] bg-gray-50 dark:bg-[#1c1c28]">
                  <div className="flex items-center gap-4 mb-2">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-300 font-semibold">Shipment {idx + 1}</span>
                    <span className={isSelfShipment(sh) ? 'badge badge-emerald' : 'badge badge-indigo'}>
                      {isSelfShipment(sh) ? 'SELF SHIPPED' : sh.deliveryPartner === 'Shadowfax' ? 'SHADOWFAX' : sh.deliveryPartner}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 mb-2">
                    <span><span className="text-gray-500 dark:text-gray-400 font-medium">Origin:</span> {sh.warehouse}</span>
                    <span><span className="text-gray-500 dark:text-gray-400 font-medium">Mode:</span> {sh.shipping_mode}</span>
                    <span><span className="text-gray-500 dark:text-gray-400 font-medium">Payment:</span> {sh.payment_mode}</span>
                    <span><span className="text-gray-500 dark:text-gray-400 font-medium">Weight:</span> {sh.weight}g</span>
                  </div>
                  <div className="flex flex-wrap gap-4 mb-2">
                    <span><span className="text-gray-500 dark:text-gray-400 font-medium">Dimensions:</span> {sh.length}L x {sh.width}W x {sh.height}H</span>
                    <span><span className="text-gray-500 dark:text-gray-400 font-medium">Fragile:</span> {sh.fragile ? 'Yes' : 'No'}</span>
                    <span><span className="text-gray-500 dark:text-gray-400 font-medium">Contents:</span> {sh.products_desc}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 mb-2">
                    <span><span className="text-gray-500 dark:text-gray-400 font-medium">Destination:</span> {formData.city}, {formData.state} {formData.pincode}</span>
                  </div>
                  {sh.deliveryPartner !== 'DTDC' && sh.deliveryPartner !== 'Shadowfax' && !isSelfShipment(sh) && (
                    <ShipmentEstimates costs={shippingCosts} tats={expectedTats} shipmentId={sh.id} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-between">
        <div></div>
        <button className="btn btn-submit w-auto px-8" onClick={handleConfirm} disabled={loadingPreview || submitting}>
          {submitting ? (
            <><span className="btn-spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 mr-2 inline-block"></span> Processing...</>
          ) : (
            'Schedule Shipment ➔'
          )}
        </button>
      </div>
    </div>
  );
}
