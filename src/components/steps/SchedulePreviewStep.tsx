'use client';

import { useEffect, useMemo, useState } from 'react';
import { CombinedFormData } from '@/types/wizard';
import { DELHIIVERY_WAREHOUSES } from '@/config/warehouses';
import { ShipmentData } from '@/types/delhivery';
type PlannedShipment = NonNullable<CombinedFormData['plannedShipments']>[0];

interface Props {
    formData: CombinedFormData;
    updateForm: (data: Partial<CombinedFormData>) => void;
    onNext: () => void;
    onPrev: () => void;
}

export default function SchedulePreviewStep({ formData, updateForm, onNext, onPrev }: Props) {
    const [shippingCost, setShippingCost] = useState<number | null>(null);
    const [expectedTat, setExpectedTat] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    // Local view over planned shipments; initialize from formData if present
    const [plannedShipments, setPlannedShipments] = useState<PlannedShipment[]>(
        formData.plannedShipments && formData.plannedShipments.length > 0
            ? formData.plannedShipments.map((sh) => ({
                ...sh,
                shipping_mode: sh.shipping_mode || formData.shipping_mode || 'Surface',
                payment_mode: sh.payment_mode || formData.payment_mode || 'Prepaid',
                fragile: sh.fragile ?? formData.fragile ?? false,
                weight: sh.weight ?? formData.weight ?? 0,
                length: sh.length ?? formData.length ?? 0,
                width: sh.width ?? formData.width ?? 0,
                height: sh.height ?? formData.height ?? 0,
                products_desc: sh.products_desc ?? formData.products_desc ?? '',
            }))
            : [
                {
                    id: 'shipment-1',
                    vendor: 'DELHIVERY',
                    warehouse: formData.warehouse as string,
                    items: formData.invoice_items.map((it, idx) => ({ lineIndex: idx, quantity: it.quantity })),
                    isSelfShipment: false,
                    shipping_mode: formData.shipping_mode || 'Surface',
                    payment_mode: formData.payment_mode || 'Prepaid',
                    fragile: formData.fragile || false,
                    weight: formData.weight || 0,
                    length: formData.length || 0,
                    width: formData.width || 0,
                    height: formData.height || 0,
                    products_desc: formData.products_desc || '',
                },
            ]
    );

    const subtotal = formData.invoice_items.reduce((acc, item) => acc + (item.item_total || 0), 0);
    const totalTax = formData.invoice_items.reduce((acc, item) => acc + (item.tax_amount || 0), 0);
    const totalDiscount = Number(formData.discount) || 0;
    const totalAdjustment = Number(formData.adjustment) || 0;
    const shippingCharge = formData.include_shipping ? 100 : 0;
    const codCharge = formData.include_cod ? 50 : 0;
    const grandTotal = subtotal + totalTax - totalDiscount + totalAdjustment + shippingCharge + codCharge;

    const anyDescriptions = useMemo(
        () => formData.invoice_items.some((it) => (it.description || '').trim().length > 0),
        [formData.invoice_items]
    );

    // Helper: compute total already allocated quantity for a given line across all planned shipments
    const getAllocatedQtyForLine = (lineIndex: number): number => {
        return plannedShipments.reduce((sum, sh) => {
            const found = sh.items.find((it) => it.lineIndex === lineIndex);
            return sum + (found?.quantity || 0);
        }, 0);
    };

    const updateShipmentItemQty = (shipmentId: string, lineIndex: number, quantity: number) => {
        setPlannedShipments((prev) =>
            prev.map((sh) => {
                if (sh.id !== shipmentId) return sh;
                const nextItems = [...sh.items];
                const existingIdx = nextItems.findIndex((it) => it.lineIndex === lineIndex);
                if (existingIdx >= 0) {
                    nextItems[existingIdx] = { ...nextItems[existingIdx], quantity };
                } else {
                    nextItems.push({ lineIndex, quantity });
                }
                return { ...sh, items: nextItems };
            })
        );
    };

    const addShipment = (kind: 'DELHIVERY' | 'SELF') => {
        setPlannedShipments((prev) => {
            const nextId = `shipment-${prev.length + 1}`;
            return [
                ...prev,
                {
                    id: nextId,
                    vendor: kind === 'SELF' ? 'SELF' : 'DELHIVERY',
                    warehouse: formData.warehouse as string,
                    items: formData.invoice_items.map((it, idx) => ({ lineIndex: idx, quantity: 0 })),
                    isSelfShipment: kind === 'SELF',
                    shipping_mode: formData.shipping_mode || 'Surface',
                    payment_mode: formData.payment_mode || 'Prepaid',
                    fragile: formData.fragile || false,
                    weight: formData.weight || 0,
                    length: formData.length || 0,
                    width: formData.width || 0,
                    height: formData.height || 0,
                    products_desc: formData.products_desc || '',
                },
            ];
        });
    };

    const removeShipment = (shipmentId: string) => {
        setPlannedShipments((prev) => prev.filter((s) => s.id !== shipmentId));
    };

    useEffect(() => {
        async function fetchPreviewData() {
            setLoadingPreview(true);
            setErrorMsg('');
            try {
                // 1. Fetch Shipping Cost
                const costParams = new URLSearchParams({
                    md: formData.shipping_mode === 'Express' ? 'E' : 'S',
                    cgm: String(formData.weight),
                    o_pin: '302001', // Example origin
                    d_pin: formData.pincode,
                    ss: 'Delivered',
                    pt: formData.payment_mode === 'Prepaid' ? 'Pre-paid' : 'COD'
                });

                const costRes = await fetch(`/api/delhivery/shipping-cost?${costParams.toString()}`);
                if (costRes.ok) {
                    const costData = await costRes.json();
                    if (costData && costData.length > 0 && costData[0].total_amount) {
                        setShippingCost(costData[0].total_amount);
                    }
                }

                // 2. Fetch Expected TAT
                const tatParams = new URLSearchParams({
                    origin_pin: '302001',
                    destination_pin: formData.pincode,
                    mot: formData.shipping_mode === 'Express' ? 'E' : 'S'
                });

                const tatRes = await fetch(`/api/delhivery/tat?${tatParams.toString()}`);
                if (tatRes.ok) {
                    const tatData = await tatRes.json();
                    if (tatData.data && typeof tatData.data.tat === 'number') {
                        const expectedDate = new Date();
                        expectedDate.setDate(expectedDate.getDate() + tatData.data.tat);
                        setExpectedTat(expectedDate.toISOString());
                    } else if (tatData.expected_delivery_date) {
                        setExpectedTat(tatData.expected_delivery_date);
                    }
                }

            } catch (err) {
                console.error('Failed to fetch preview data', err);
            } finally {
                setLoadingPreview(false);
            }
        }

        fetchPreviewData();
    }, [formData.shipping_mode, formData.weight, formData.pincode, formData.payment_mode]);

    const saveWaybillToHistory = (waybill: string, orderId: string, consignee: string) => {
        try {
            const historyStr = localStorage.getItem('delhivery_recent_orders');
            const history = historyStr ? JSON.parse(historyStr) : [];

            const newOrder = {
                waybill,
                orderId,
                consignee,
                date: new Date().toISOString()
            };

            const newHistory = [newOrder, ...history].slice(0, 5);
            localStorage.setItem('delhivery_recent_orders', JSON.stringify(newHistory));
        } catch (e) {
            console.error('Failed to save to localStorage', e);
        }
    };

    const handleConfirm = async () => {
        setSubmitting(true);
        setErrorMsg('');

        try {
            if (!formData.orderId) {
                throw new Error("Missing Order ID");
            }

            // Validate allocations: for each line item, allocated qty cannot exceed its quantity
            const allocationErrors: string[] = [];
            formData.invoice_items.forEach((item, idx) => {
                const allocated = getAllocatedQtyForLine(idx);
                if (allocated > item.quantity) {
                    allocationErrors.push(`Item ${idx + 1} allocation exceeds quantity (${allocated}/${item.quantity}).`);
                }
            });

            if (allocationErrors.length > 0) {
                throw new Error(allocationErrors[0]);
            }

            const createdShipmentsForOrder: {
                vendor: string;
                waybill?: string;
                shippingCost: number;
                warehouse: string;
                items: { lineIndex: number; quantity: number }[];
            }[] = [];

            const allWaybills: string[] = [];

            // Prepare all shipment payloads for backend
            // Prepare and send shipments one by one
            const delhiveryShipments = plannedShipments
                .map((sh, index) => ({ sh, index }))
                .filter(({ sh }) => !(sh.isSelfShipment || sh.vendor === 'SELF'));

            for (const { sh, index } of delhiveryShipments) {
                const effectiveItems = sh.items.filter((it) => it.quantity > 0);
                if (effectiveItems.length === 0) continue;

                let shipmentAmount = 0;
                effectiveItems.forEach((it) => {
                    const base = formData.invoice_items[it.lineIndex];
                    const perUnitTotal = ((base.item_total || 0) + (base.tax_amount || 0)) / (base.quantity || 1);
                    shipmentAmount += perUnitTotal * it.quantity;
                });
                const resolvedFinalPrice = shipmentAmount || grandTotal;

                // Sanitize phone number (last 10 digits)
                const sanitizedPhone = (formData.phone || '').replace(/\D/g, '').slice(-10);

                // Map and clean payload for Delhivery
                const payload = {
                    name: formData.customer_name,
                    add: formData.phone ? `${formData.address}, Ph: ${formData.country_code} ${formData.phone}` : formData.address,
                    pin: parseInt(formData.pincode, 10),
                    city: formData.city,
                    state: formData.state,
                    country: formData.country,
                    phone: sanitizedPhone,

                    // ✅ Append the index to guarantee a unique order ID for each package
                    order: `${formData.orderId}-PKG${index + 1}`,

                    payment_mode: sh.payment_mode,
                    total_amount: Number(resolvedFinalPrice.toFixed(2)),
                    cod_amount: sh.payment_mode === 'COD' ? Number(resolvedFinalPrice.toFixed(2)) : 0,
                    products_desc: sh.products_desc || "Spiritual Items",
                    quantity: "1",
                    pickup_location: sh.warehouse || (formData.warehouse as string),

                    // Specific mapping for Delhivery dimensions and flags
                    shipment_length: sh.length || 0,
                    shipment_width: sh.width || 0,
                    shipment_height: sh.height || 0,
                    fragile_shipment: sh.fragile ? "true" : "false",
                    shipping_mode: sh.shipping_mode
                };


                // Send single shipment
                const shipmentRes = await fetch('/api/delhivery/shipment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                const rawResult = await shipmentRes.json();

                // The API now returns { results: [{ status, data }], success: boolean }
                // Since we are sending one by one in this loop, we look at results[0]
                const result = rawResult.results?.[0];

                // Handle single result
                if (!result || result.status !== 200 || !result.data || !result.data.success) {
                    let errorStr = 'Failed to create Delhivery shipment.';
                    if (result?.data?.rmk) {
                        errorStr = result.data.rmk;
                    } else if (typeof result?.data?.error === 'string') {
                        errorStr = result.data.error;
                    } else if (typeof result?.error === 'string') {
                        errorStr = result.error;
                    } else if (result?.data?.packages?.[0]?.remarks) {
                        errorStr = result.data.packages[0].remarks;
                    }
                    throw new Error(`Shipment ${index + 1} Failed: ${errorStr}`);
                }

                const generatedWaybill = result.data?.packages?.[0]?.waybill;

                if (generatedWaybill) {
                    allWaybills.push(generatedWaybill);
                    saveWaybillToHistory(generatedWaybill, formData.orderId ?? '', formData.customer_name ?? '');
                }

                createdShipmentsForOrder.push({
                    vendor: sh.vendor || 'DELHIVERY',
                    waybill: generatedWaybill,
                    shippingCost: shippingCost || 0,
                    warehouse: sh.warehouse || (formData.warehouse as string),
                    items: effectiveItems,
                });
            }


            // Add self shipments
            plannedShipments.forEach((sh) => {
                if (sh.isSelfShipment || sh.vendor === 'SELF') {
                    const effectiveItems = sh.items.filter((it) => it.quantity > 0);
                    if (effectiveItems.length === 0) return;
                    createdShipmentsForOrder.push({
                        vendor: 'SELF',
                        shippingCost: 0,
                        warehouse: sh.warehouse,
                        items: effectiveItems,
                    });
                }
            });

            if (createdShipmentsForOrder.length === 0) {
                throw new Error('No shipment rows defined. Allocate at least one item to a shipment or mark as self shipped.');
            }

            // Compute aggregate shipped quantities to decide status
            const shippedQtyPerLine: number[] = formData.invoice_items.map(() => 0);
            createdShipmentsForOrder.forEach((sh) => {
                sh.items.forEach((it) => {
                    shippedQtyPerLine[it.lineIndex] += it.quantity;
                });
            });

            let allShipped = true;
            let anyShipped = false;
            formData.invoice_items.forEach((item, idx) => {
                const shipped = shippedQtyPerLine[idx];
                if (shipped > 0) anyShipped = true;
                if (shipped < item.quantity) allShipped = false;
            });

            const nextStatus = allShipped ? 'SHIPPED' : anyShipped ? 'PARTIALLY_SHIPPED' : 'PENDING_SHIPPING';
            const anySelf = createdShipmentsForOrder.some((s) => s.vendor === 'SELF');

            // Persist shipments & status to the order
            await fetch(`/api/orders/${formData.orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: nextStatus,
                    selfShipped: anySelf,
                    shipmentsAppend: createdShipmentsForOrder,
                    waybill: allWaybills[0] ?? null,
                    waybills: allWaybills,
                    shippingCost: createdShipmentsForOrder.reduce((sum, s) => sum + (s.shippingCost || 0), 0),
                }),
            });

            updateForm({
                waybill: allWaybills[0],
                waybills: allWaybills,
                plannedShipments,
            });

            onNext();

        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Unknown error occurred');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="form-section animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="section-title">
                <span className="section-icon">🔍</span> Confirm Shipping
            </h3>

            {errorMsg && (
                <div className="form-error">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    {errorMsg}
                </div>
            )}

            {/* Items list (with optional descriptions) */}
            <div className="mb-6 bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-2xl p-5 shadow-sm">
                <h4 className="text-gray-900 dark:text-accent font-bold mb-4 border-b border-gray-100 dark:border-[#2a2a38] pb-3 flex items-center gap-2 text-lg">
                    📦 Items in this Order
                </h4>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 bg-gray-50 dark:bg-[#1c1c28] uppercase border-b border-gray-100 dark:border-[#2a2a38]">
                            <tr>
                                <th className="px-2 py-2 rounded-l-lg font-semibold">Item</th>
                                {anyDescriptions && <th className="px-2 py-2 font-semibold">Description</th>}
                                <th className="px-2 py-2 font-semibold text-center">Qty</th>
                                <th className="px-2 py-2 rounded-r-lg font-semibold text-center">Allocated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a38]">
                            {formData.invoice_items.map((it, idx) => (
                                <tr key={idx} className="text-gray-700 dark:text-gray-300">
                                    <td className="px-2 py-2.5 font-medium">{it.name}</td>
                                    {anyDescriptions && (
                                        <td className="px-2 py-2.5 text-xs text-gray-500">
                                            {(it.description || '').trim() ? it.description : <span className="italic text-gray-400">—</span>}
                                        </td>
                                    )}
                                    <td className="px-2 py-2.5 text-center">{it.quantity}</td>
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

            {/* Shipment planner UI */}
            <div className="mb-6 bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-4 border-b border-gray-100 dark:border-[#2a2a38] pb-3">
                    <h4 className="text-gray-900 dark:text-accent font-bold flex items-center gap-2 text-lg mb-0">
                        🧩 Split Shipments
                    </h4>
                    <div className="flex gap-2">
                        <button type="button" className="btn btn-secondary py-2 px-3 text-sm" onClick={() => addShipment('DELHIVERY')}>
                            + Delhivery Shipment
                        </button>
                        <button type="button" className="btn btn-secondary py-2 px-3 text-sm" onClick={() => addShipment('SELF')}>
                            + Self Shipped
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    {plannedShipments.map((sh, idx) => (
                        <div key={sh.id} className="border border-gray-100 dark:border-[#2a2a38] rounded-xl p-4 bg-gray-50 dark:bg-[#1c1c28]">
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                                        Shipment {idx + 1}
                                    </span>
                                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${sh.isSelfShipment || sh.vendor === 'SELF' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-indigo-500/20 text-indigo-300'}`}>
                                        {(sh.isSelfShipment || sh.vendor === 'SELF') ? 'SELF SHIPPED' : 'DELHIVERY'}
                                    </span>
                                </div>
                                {plannedShipments.length > 1 && (
                                    <button type="button" className="text-xs text-red-400 hover:underline" onClick={() => removeShipment(sh.id)}>
                                        Remove
                                    </button>
                                )}
                            </div>

                            <div className="form-grid-2">
                                <div className="form-group">
                                    <label>Vendor</label>
                                    <input
                                        className="form-input"
                                        value={sh.vendor}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, vendor: v, isSelfShipment: v === 'SELF' } : s));
                                        }}
                                        placeholder={sh.isSelfShipment ? 'SELF' : 'e.g. DELHIVERY or vendor name'}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Warehouse</label>
                                    <select
                                        className="form-input"
                                        value={sh.warehouse}
                                        onChange={(e) => {
                                            const w = e.target.value;
                                            setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, warehouse: w } : s));
                                        }}
                                    >
                                        {DELHIIVERY_WAREHOUSES.map((w: string) => (
                                            <option key={w} value={w}>{w}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Shipping Mode</label>
                                    <div className="flex gap-4 mt-1">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={sh.shipping_mode === 'Surface'}
                                                onChange={() => setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, shipping_mode: 'Surface' } : s))}
                                                className="accent-accent"
                                            />
                                            <span className="text-sm">Surface</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={sh.shipping_mode === 'Express'}
                                                onChange={() => setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, shipping_mode: 'Express' } : s))}
                                                className="accent-accent"
                                            />
                                            <span className="text-sm">Express</span>
                                        </label>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Payment Mode</label>
                                    <div className="flex gap-4 mt-1">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={sh.payment_mode === 'Prepaid'}
                                                onChange={() => setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, payment_mode: 'Prepaid' } : s))}
                                                className="accent-accent"
                                            />
                                            <span className="text-sm">Prepaid</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={sh.payment_mode === 'COD'}
                                                onChange={() => setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, payment_mode: 'COD' } : s))}
                                                className="accent-accent"
                                            />
                                            <span className="text-sm">Cash on Delivery (COD)</span>
                                        </label>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Fragile Shipment?</label>
                                    <div className="flex items-center gap-2 h-10">
                                        <input
                                            type="checkbox"
                                            checked={!!sh.fragile}
                                            onChange={(e) => setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, fragile: e.target.checked } : s))}
                                            className="w-4 h-4 accent-accent rounded"
                                        />
                                        <span className="text-sm text-gray-300">Yes, handle with care</span>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Chargeable Weight (Grams) *</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        value={sh.weight || ''}
                                        onChange={(e) => setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, weight: Number(e.target.value) } : s))}
                                        placeholder="e.g. 500"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Dimensions (cm) - Optional</label>
                                    <div className="flex gap-2">
                                        <input
                                            className="form-input flex-1"
                                            type="number"
                                            placeholder="L"
                                            value={sh.length || ''}
                                            onChange={(e) => setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, length: Number(e.target.value) } : s))}
                                        />
                                        <input
                                            className="form-input flex-1"
                                            type="number"
                                            placeholder="W"
                                            value={sh.width || ''}
                                            onChange={(e) => setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, width: Number(e.target.value) } : s))}
                                        />
                                        <input
                                            className="form-input flex-1"
                                            type="number"
                                            placeholder="H"
                                            value={sh.height || ''}
                                            onChange={(e) => setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, height: Number(e.target.value) } : s))}
                                        />
                                    </div>
                                </div>
                                <div className="form-group col-span-1 md:col-span-2">
                                    <label>Package Contents Description *</label>
                                    <input
                                        className="form-input"
                                        value={sh.products_desc || ''}
                                        onChange={(e) => setPlannedShipments((prev) => prev.map((s) => s.id === sh.id ? { ...s, products_desc: e.target.value } : s))}
                                        placeholder="e.g. T-shirts, Books"
                                    />
                                </div>
                            </div>

                            <div className="mt-3 overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-500 uppercase border-b border-gray-200 dark:border-[#2a2a38]">
                                        <tr>
                                            <th className="px-2 py-2 font-semibold">Item</th>
                                            <th className="px-2 py-2 font-semibold text-center">Qty</th>
                                            <th className="px-2 py-2 font-semibold text-center">This shipment</th>
                                            <th className="px-2 py-2 font-semibold text-center">Remaining</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a38]">
                                        {formData.invoice_items.map((it, lineIndex) => {
                                            const thisQty = sh.items.find((x) => x.lineIndex === lineIndex)?.quantity || 0;
                                            const allocatedAcrossAll = getAllocatedQtyForLine(lineIndex);
                                            const remaining = Math.max(0, it.quantity - allocatedAcrossAll + thisQty);
                                            return (
                                                <tr key={lineIndex} className="text-gray-700 dark:text-gray-300">
                                                    <td className="px-2 py-2.5 font-medium">{it.name}</td>
                                                    <td className="px-2 py-2.5 text-center">{it.quantity}</td>
                                                    <td className="px-2 py-2.5 text-center">
                                                        <input
                                                            type="number"
                                                            className="form-input w-24 text-center py-1"
                                                            min={0}
                                                            max={remaining}
                                                            value={thisQty}
                                                            onChange={(e) => {
                                                                const next = Math.max(0, Math.min(remaining, Number(e.target.value) || 0));
                                                                updateShipmentItemQty(sh.id, lineIndex, next);
                                                            }}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2.5 text-center text-xs text-gray-500">
                                                        {remaining - thisQty}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {loadingPreview ? (
                <div className="py-16 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#16161f] rounded-xl border border-dashed border-gray-200 dark:border-[#2a2a38] animate-pulse">
                    <div className="btn-spinner border-[3px] border-accent border-t-transparent rounded-full w-10 h-10 mx-auto mb-4"></div>
                    <p className="font-medium">Calculating shipping estimates & routing...</p>
                </div>
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
                                        <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Shipment {idx + 1}</span>
                                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${sh.isSelfShipment || sh.vendor === 'SELF' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-indigo-500/20 text-indigo-300'}`}>
                                            {(sh.isSelfShipment || sh.vendor === 'SELF') ? 'SELF SHIPPED' : sh.vendor}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-4 mb-2">
                                        <div><span className="text-gray-500 font-medium">Origin Warehouse:</span> <span className="font-medium text-gray-900 dark:text-white">{sh.warehouse}</span></div>
                                        <div><span className="text-gray-500 font-medium">Fulfillment Mode:</span> <span className="font-medium text-gray-900 dark:text-white">{sh.shipping_mode}</span></div>
                                        <div><span className="text-gray-500 font-medium">Payment:</span> <span className="font-medium text-gray-900 dark:text-white">{sh.payment_mode}</span></div>
                                        <div><span className="text-gray-500 font-medium">Gross Weight:</span> <span className="font-medium text-gray-900 dark:text-white">{sh.weight}g</span></div>
                                    </div>
                                    <div className="flex flex-wrap gap-4 mb-2">
                                        <div><span className="text-gray-500 font-medium">Dimensions:</span> <span className="font-medium text-gray-900 dark:text-white">{sh.length}L x {sh.width}W x {sh.height}H</span></div>
                                        <div><span className="text-gray-500 font-medium">Fragile:</span> <span className="font-medium text-gray-900 dark:text-white">{sh.fragile ? 'Yes' : 'No'}</span></div>
                                        <div><span className="text-gray-500 font-medium">Contents:</span> <span className="font-medium text-gray-900 dark:text-white">{sh.products_desc}</span></div>
                                    </div>
                                    <div className="flex flex-wrap gap-4 mb-2">
                                        <div><span className="text-gray-500 font-medium">Destination:</span> <span className="font-semibold text-gray-900 dark:text-white uppercase tracking-wide text-xs">{formData.city}, {formData.state} {formData.pincode}</span></div>
                                    </div>
                                    <div className="mt-4 p-4 bg-linear-to-br from-indigo-50 to-white dark:from-[#1c1c28] dark:to-[#22222e] rounded-xl border border-indigo-100 dark:border-accent/30 shadow-sm relative overflow-hidden">
                                        <h5 className="text-xs uppercase text-accent mb-4 font-bold tracking-widest flex items-center gap-2">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                            Delhivery Estimates
                                        </h5>
                                        <div className="space-y-3 relative z-10">
                                            <div className="flex justify-between items-center bg-white/50 dark:bg-black/20 p-2.5 rounded-lg">
                                                <span className="text-gray-600 dark:text-gray-400 font-medium text-xs">Est. Shipping Cost</span>
                                                <span className="font-bold text-gray-900 dark:text-white text-base">{shippingCost ? `₹${shippingCost}` : <span className="text-gray-400 font-normal italic text-sm">Calculating...</span>}</span>
                                            </div>
                                            <div className="flex justify-between items-center bg-white/50 dark:bg-black/20 p-2.5 rounded-lg">
                                                <span className="text-gray-600 dark:text-gray-400 font-medium text-xs">Expected Delivery</span>
                                                <span className="font-bold text-gray-900 dark:text-white text-base">{expectedTat ? new Date(expectedTat).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : <span className="text-gray-400 font-normal italic text-sm">Calculating...</span>}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="mt-8 flex justify-between">
                <button className="btn btn-secondary" onClick={onPrev} disabled={submitting}>
                    🡨 Back
                </button>
                <button
                    className="btn btn-submit w-auto px-8"
                    onClick={handleConfirm}
                    disabled={loadingPreview || submitting}
                >
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
