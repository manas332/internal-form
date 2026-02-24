'use client';

import { useState, useEffect } from 'react';
import { CombinedFormData } from '@/types/wizard';
import { ShipmentData } from '@/types/delhivery';

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

    const subtotal = formData.invoice_items.reduce((acc, item) => acc + (item.item_total || 0), 0);
    const totalTax = formData.invoice_items.reduce((acc, item) => acc + (item.tax_amount || 0), 0);
    const totalDiscount = Number(formData.discount) || 0;
    const totalAdjustment = Number(formData.adjustment) || 0;
    const shippingCharge = formData.include_shipping ? 100 : 0;
    const codCharge = formData.include_cod ? 50 : 0;
    const grandTotal = subtotal + totalTax - totalDiscount + totalAdjustment + shippingCharge + codCharge;

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

            // Create Delhivery Shipment
            const resolvedFinalPrice = formData.shipping_final_price !== undefined ? formData.shipping_final_price : grandTotal;

            const shipmentData: ShipmentData = {
                name: formData.customer_name,
                add: formData.phone ? `${formData.address}, Ph: ${formData.country_code} ${formData.phone}` : formData.address,
                pin: parseInt(formData.pincode, 10),
                city: formData.city,
                state: formData.state,
                country: formData.country,
                phone: `${formData.country_code}${formData.phone}`,
                order: formData.orderId,
                payment_mode: formData.payment_mode,
                total_amount: resolvedFinalPrice,
                cod_amount: formData.payment_mode === 'COD' ? resolvedFinalPrice : 0,
                weight: formData.weight,
                shipping_mode: formData.shipping_mode,
                products_desc: formData.shipping_item_desc || "Spritual Items",
                quantity: "1",
            };

            if (formData.fragile) shipmentData.fragile_shipment = "true";
            if (formData.length) shipmentData.shipment_length = formData.length;
            if (formData.width) shipmentData.shipment_width = formData.width;
            if (formData.height) shipmentData.shipment_height = formData.height;

            const finalShipmentPayload: any = {
                ...shipmentData,
            };

            if (formData.shipping_seller_name || formData.shipping_seller_address || formData.shipping_seller_phone) {
                finalShipmentPayload.return_name = formData.shipping_seller_name || " ";
                finalShipmentPayload.return_pin = 302001;
                finalShipmentPayload.return_city = "Jaipur";
                finalShipmentPayload.return_phone = formData.shipping_seller_phone || " ";
                finalShipmentPayload.return_state = "Haryana";
                finalShipmentPayload.return_add = formData.shipping_seller_address || " ";
                finalShipmentPayload.return_country = "India";
            } else {
                finalShipmentPayload.seller_name = " ";
                finalShipmentPayload.seller_add = " ";
                finalShipmentPayload.seller_inv = " ";
                finalShipmentPayload.return_name = " ";
                finalShipmentPayload.return_add = " ";
                finalShipmentPayload.return_phone = " ";
                finalShipmentPayload.return_city = " ";
                finalShipmentPayload.return_state = " ";
                finalShipmentPayload.return_country = " ";
            }

            const shipmentRes = await fetch('/api/delhivery/shipment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shipment: finalShipmentPayload,
                    pickup_location: formData.warehouse as string
                })
            });

            const shipmentResult = await shipmentRes.json();

            if (!shipmentRes.ok || !shipmentResult.success) {
                let errorStr = 'Failed to create Delhivery shipment.';

                if (shipmentResult.rmk) {
                    errorStr = shipmentResult.rmk;
                } else if (shipmentResult.error && typeof shipmentResult.error === 'string') {
                    errorStr = shipmentResult.error;
                } else if (shipmentResult.error && typeof shipmentResult.error === 'object') {
                    errorStr = JSON.stringify(shipmentResult.error);
                } else if (shipmentResult.packages && shipmentResult.packages[0] && shipmentResult.packages[0].remarks) {
                    errorStr = shipmentResult.packages[0].remarks;
                }

                throw new Error(`Delhivery Shipment Failed: ${errorStr}`);
            }

            const generatedWaybill = shipmentResult.packages[0].waybill;

            // Save to tracking history
            saveWaybillToHistory(generatedWaybill, formData.orderId, formData.customer_name);

            // Update order status in DB to SHIPPED and store waybill / labelUrl
            await fetch(`/api/orders/${formData.orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'SHIPPED',
                    waybill: generatedWaybill,
                    shippingCost: shippingCost || 0
                })
            });

            // Update state and proceed
            updateForm({
                waybill: generatedWaybill
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

                        <div className="text-sm space-y-4 text-gray-600 dark:text-gray-300">
                            <div className="flex justify-between items-center bg-gray-50 dark:bg-[#1c1c28] p-3.5 rounded-xl border border-gray-100 dark:border-transparent">
                                <span className="text-gray-500 font-medium">Destination</span>
                                <span className="font-semibold text-gray-900 dark:text-white uppercase tracking-wide text-xs">{formData.city}, {formData.state} {formData.pincode}</span>
                            </div>

                            <div className="space-y-3 px-1 py-1">
                                <p className="flex justify-between items-center pb-2 border-b border-gray-50 dark:border-[#2a2a38]/50"><span className="text-gray-500 font-medium">Origin Warehouse</span> <span className="text-gray-900 dark:text-white font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-xs">{formData.warehouse}</span></p>
                                <p className="flex justify-between items-center pb-2 border-b border-gray-50 dark:border-[#2a2a38]/50"><span className="text-gray-500 font-medium">Fulfillment Mode</span> <span className="font-semibold text-gray-900 dark:text-white uppercase tracking-wide text-xs">{formData.shipping_mode}</span></p>
                                <p className="flex justify-between items-center pb-2 border-b border-gray-50 dark:border-[#2a2a38]/50"><span className="text-gray-500 font-medium">Payment terms</span> <span className={`font-bold px-2 py-0.5 rounded-md text-xs ${formData.payment_mode === 'Prepaid' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>{formData.payment_mode}</span></p>
                                <p className="flex justify-between items-center"><span className="text-gray-500 font-medium">Gross Weight</span> <span className="font-medium text-gray-900 dark:text-white">{formData.weight} <span className="text-gray-400 text-xs">g</span></span></p>
                            </div>

                            <div className="mt-6 p-5 bg-gradient-to-br from-indigo-50 to-white dark:from-[#1c1c28] dark:to-[#22222e] rounded-xl border border-indigo-100 dark:border-accent/30 shadow-sm relative overflow-hidden">
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
