'use client';

import { useState, useEffect } from 'react';
import { CombinedFormData } from '@/types/wizard';
import { ShipmentData } from '@/types/delhivery';
import stateCodesData from '@/data/state-codes.json';
import { isInterstateOrder, get18PctTaxId } from '@/lib/tax';

interface Props {
    formData: CombinedFormData;
    updateForm: (data: Partial<CombinedFormData>) => void;
    onNext: () => void;
    onPrev: () => void;
}

export default function PreviewStep({ formData, updateForm, onNext, onPrev }: Props) {
    const [shippingCost, setShippingCost] = useState<number | null>(null);
    const [expectedTat, setExpectedTat] = useState<string | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const isInterstate = isInterstateOrder(formData.state);

    /** Build a shipping/COD line item with 18% GST inclusive pricing. */
    const buildChargeItem = (name: string, finalPrice: number, description: string) => {
        const taxId = get18PctTaxId(isInterstate);
        const preTaxRate = taxId !== 'NO_TAX' ? finalPrice / 1.18 : finalPrice;
        const taxAmount = taxId !== 'NO_TAX' ? finalPrice - preTaxRate : 0;
        return {
            name,
            description,
            quantity: 1,
            price: preTaxRate,
            final_price: finalPrice,
            tax_id: taxId,
            tax_amount: taxAmount,
            item_total: preTaxRate,
            zoho_item_id: '__system__', // tells invoice route to skip catalog creation
        };
    };

    const deliveryItem = formData.include_shipping ? buildChargeItem('Delivery Charges', 100, 'Shipping and handling') : null;
    const codItem = formData.include_cod ? buildChargeItem('COD Charges', 50, 'Cash on Delivery fee') : null;

    const subtotal = formData.invoice_items.reduce((acc, item) => acc + (item.item_total || 0), 0);
    let totalTax = formData.invoice_items.reduce((acc, item) => acc + (item.tax_amount || 0), 0);

    if (deliveryItem) totalTax += deliveryItem.tax_amount;
    if (codItem) totalTax += codItem.tax_amount;

    const totalDiscount = Number(formData.discount) || 0;
    const totalAdjustment = Number(formData.adjustment) || 0;
    const shippingCharge = deliveryItem ? deliveryItem.price : 0;
    const codCharge = codItem ? codItem.price : 0;
    const combinedShippingCharge = shippingCharge + codCharge;
    const grandTotal = subtotal + totalTax - totalDiscount + totalAdjustment + combinedShippingCharge;

    useEffect(() => {
        async function fetchPreviewData() {
            setLoadingPreview(true);
            setErrorMsg('');
            try {
                // 1. Fetch Shipping Cost
                const costParams = new URLSearchParams({
                    md: formData.shipping_mode === 'Express' ? 'E' : 'S',
                    cgm: String(formData.weight),
                    o_pin: '302001', // Example origin pin since we don't have it in the form. Assumed Jaipur for now based on facility. 
                    d_pin: formData.pincode,
                    ss: 'Delivered',
                    pt: formData.payment_mode === 'Prepaid' ? 'Pre-paid' : 'COD'
                });

                const costRes = await fetch(`/api/delhivery/shipping-cost?${costParams.toString()}`);
                if (costRes.ok) {
                    const costData = await costRes.json();
                    // Find total amount from response (assuming first object has total_amount)
                    if (costData && costData.length > 0 && costData[0].total_amount) {
                        setShippingCost(costData[0].total_amount);
                    }
                }

                // 2. Fetch Expected TAT
                // We need an origin pin for TAT as well. Defaulting to 302001.
                const tatParams = new URLSearchParams({
                    origin_pin: '302001',
                    destination_pin: formData.pincode,
                    mot: formData.shipping_mode === 'Express' ? 'E' : 'S'
                });

                const tatRes = await fetch(`/api/delhivery/tat?${tatParams.toString()}`);
                if (tatRes.ok) {
                    const tatData = await tatRes.json();
                    if (tatData.data && typeof tatData.data.tat === 'number') {
                        // The track.delhivery.com endpoint returns { data: { tat: 3 } }
                        // Calculate expected date by adding TAT days to today
                        const expectedDate = new Date();
                        expectedDate.setDate(expectedDate.getDate() + tatData.data.tat);
                        setExpectedTat(expectedDate.toISOString());
                    } else if (tatData.expected_delivery_date) {
                        // Fallback in case it ever returns the old format
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

            // Keep only last 5
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
            // 1. Create Zoho Invoice
            const finalInvoiceItems = [...formData.invoice_items];

            if (deliveryItem) {
                finalInvoiceItems.push(deliveryItem);
            }

            if (codItem) {
                finalInvoiceItems.push(codItem);
            }


            const invoicePayload = {
                customer_id: formData.customer_id,
                date: formData.date,
                due_date: formData.due_date || undefined,
                reference_number: formData.reference_number || undefined,
                gst_treatment: formData.gst_treatment,
                salesperson_name: formData.salesperson_name || undefined,
                gst_no: undefined, // removed as per user sync
                place_of_supply: stateCodesData.find(s => s.name === formData.state)?.code || formData.state,
                invoice_items: finalInvoiceItems,
                discount: Number(formData.discount) || undefined,
                discount_type: formData.discount_type,
                adjustment: Number(formData.adjustment) || undefined,
                adjustment_description: formData.adjustment_description || undefined,
                notes: formData.notes,
                terms: formData.terms,
            };

            const invoiceRes = await fetch('/api/invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(invoicePayload)
            });

            const invoiceData = await invoiceRes.json();

            if (!invoiceRes.ok) {
                throw new Error(invoiceData.error || 'Failed to create invoice in Zoho');
            }

            const createdInvoiceId = invoiceData.invoice.invoice_id;
            const createdInvoiceNumber = invoiceData.invoice.invoice_number;

            // 2. Create Delhivery Shipment
            // Pull the exact total calculate from Zoho to ensure taxes match 100% on the shipping label
            const zohoCalculatedTotal = invoiceData.invoice.total || grandTotal;

            const resolvedFinalPrice = zohoCalculatedTotal;


            const shipmentData: ShipmentData = {
                name: formData.customer_name,
                add: formData.phone ? `${formData.address}, Ph: ${formData.country_code} ${formData.phone}` : formData.address,
                pin: parseInt(formData.pincode, 10), // Cast to integer per Delhivery API doc
                city: formData.city,
                state: formData.state,
                country: formData.country,
                phone: `${formData.country_code}${formData.phone}`,
                order: createdInvoiceNumber, // Use Zoho Invoice Number as Order ID
                payment_mode: formData.payment_mode,
                total_amount: resolvedFinalPrice,
                cod_amount: formData.payment_mode === 'COD' ? resolvedFinalPrice : 0,
                weight: formData.weight,
                shipping_mode: formData.shipping_mode,
                products_desc: formData.products_desc || "Spiritual Items",
                quantity: "1", // Delhivery expects this as a explicitly "1" string in B2C
            };

            // Only append optional fields if they actually have a value to prevent Delhivery backend crashes on empty strings
            if (formData.fragile) {
                shipmentData.fragile_shipment = "true";
            }
            if (formData.length) {
                shipmentData.shipment_length = formData.length;
            }
            if (formData.width) {
                shipmentData.shipment_width = formData.width;
            }
            if (formData.height) {
                shipmentData.shipment_height = formData.height;
            }

            // Always hide seller info on the shipping label
            const finalShipmentPayload: Record<string, unknown> = {
                ...shipmentData,
                seller_name: " ",
                seller_add: " ",
                seller_inv: " ",
                return_name: " ",
                return_add: " ",
                return_phone: " ",
                return_city: " ",
                return_state: " ",
                return_country: " ",
            };

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
                // Even if it failed, we generated an invoice. 
                console.warn("Shipment creation failed, but invoice was created.", shipmentResult);
                let errorStr = 'Failed to create Delhivery shipment.';

                if (shipmentResult.rmk) {
                    // Delhivery B2C API uses "rmk" for the root error string
                    errorStr = shipmentResult.rmk;
                } else if (shipmentResult.error && typeof shipmentResult.error === 'string') {
                    errorStr = shipmentResult.error;
                } else if (shipmentResult.error && typeof shipmentResult.error === 'object') {
                    errorStr = JSON.stringify(shipmentResult.error);
                } else if (shipmentResult.packages && shipmentResult.packages[0] && shipmentResult.packages[0].remarks) {
                    errorStr = shipmentResult.packages[0].remarks;
                }

                throw new Error(`Zoho Invoice Created (#${createdInvoiceNumber}), but Delhivery Shipment Failed: ${errorStr}`);
            }

            const generatedWaybill = shipmentResult.packages[0].waybill;

            // Save to tracking history
            saveWaybillToHistory(generatedWaybill, createdInvoiceNumber, formData.customer_name);

            // 3. Update state and proceed
            updateForm({
                invoiceId: createdInvoiceId,
                orderId: createdInvoiceNumber,
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
                <span className="section-icon">🔍</span> Final Review & Confirmation
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Left Column - Invoice Details */}
                    <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                        <h4 className="text-gray-900 dark:text-accent font-bold mb-5 border-b border-gray-100 dark:border-[#2a2a38] pb-3 flex items-center gap-2 text-lg">
                            📄 Invoice Summary
                        </h4>

                        <div className="text-sm space-y-3 text-gray-600 dark:text-gray-300">
                            <div className="bg-gray-50 dark:bg-[#1c1c28] p-3.5 rounded-xl border border-gray-100 dark:border-transparent flex justify-between items-center">
                                <span className="text-gray-500 dark:text-gray-400 font-medium">Customer</span>
                                <strong className="text-gray-900 dark:text-white font-semibold flex items-center gap-1.5">
                                    👤 {formData.customer_name}
                                </strong>
                            </div>
                            <div className="space-y-2 px-1 py-1">
                                <p className="flex items-start justify-between"><span className="text-gray-500 dark:text-gray-400 font-medium">Address</span> <span className="text-right max-w-[200px] leading-tight">{formData.address}</span></p>
                                <p className="flex justify-between"><span className="text-gray-500 dark:text-gray-400 font-medium">Location</span> <span className="text-right font-medium">{formData.city}, {formData.state} {formData.pincode}</span></p>
                                <p className="flex justify-between"><span className="text-gray-500 dark:text-gray-400 font-medium">Phone</span> <span className="text-right">{formData.country_code} {formData.phone}</span></p>
                            </div>
                        </div>

                        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-[#2a2a38]">
                            <h5 className="text-xs uppercase text-gray-400 mb-3 font-bold tracking-wider">Line Items ({formData.invoice_items.length})</h5>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left mb-4">
                                    <thead className="text-xs text-gray-500 bg-gray-50 dark:bg-[#1c1c28] uppercase border-b border-gray-100 dark:border-[#2a2a38]">
                                        <tr>
                                            <th className="px-2 py-2 rounded-l-lg font-semibold">Item</th>
                                            <th className="px-2 py-2 font-semibold text-center">Qty</th>
                                            <th className="px-2 py-2 font-semibold text-right">Tax</th>
                                            <th className="px-2 py-2 rounded-r-lg font-semibold text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a38]">
                                        {formData.invoice_items.map((it, idx) => {
                                            const displayName = it.carat_size != null
                                                ? `${it.name} ${it.carat_size.toFixed(2)} carat`
                                                : it.name;
                                            return (
                                                <tr key={idx} className="text-gray-700 dark:text-gray-300">
                                                    <td className="px-2 py-2.5 font-medium">{displayName}</td>
                                                    <td className="px-2 py-2.5 text-center">{it.quantity}</td>
                                                    <td className="px-2 py-2.5 text-right text-xs text-gray-500">{it.tax_amount ? `₹${it.tax_amount.toFixed(2)}` : '-'}</td>
                                                    <td className="px-2 py-2.5 text-right font-medium text-gray-900 dark:text-white">₹{((it.item_total || 0) + (it.tax_amount || 0)).toFixed(2)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {totalTax > 0 && (
                                <div className="flex justify-between text-gray-500 dark:text-gray-400 text-sm pb-3 px-2">
                                    <span className="font-medium">Total Tax</span>
                                    <span>₹{totalTax.toFixed(2)}</span>
                                </div>
                            )}
                            {shippingCharge > 0 && (
                                <div className="flex justify-between text-gray-500 dark:text-gray-400 text-sm pb-1 px-2">
                                    <span className="font-medium">Delivery Charges (incl. GST)</span>
                                    <span>₹{(deliveryItem?.final_price || 0).toFixed(2)}</span>
                                </div>
                            )}
                            {codCharge > 0 && (
                                <div className="flex justify-between text-gray-500 dark:text-gray-400 text-sm pb-3 px-2">
                                    <span className="font-medium">COD Charges (incl. GST)</span>
                                    <span>₹{(codItem?.final_price || 0).toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-3 border-t border-gray-200 dark:border-[#2a2a38] border-dashed text-lg px-2 bg-gray-50 dark:bg-transparent rounded-b-lg">
                                <span>Grand Total</span>
                                <span className="text-accent">₹{grandTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Shipping Details */}
                    <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                        <h4 className="text-gray-900 dark:text-accent font-bold mb-5 border-b border-gray-100 dark:border-[#2a2a38] pb-3 flex items-center gap-2 text-lg">
                            🚚 Shipping Routing
                        </h4>

                        <div className="text-sm space-y-4 text-gray-600 dark:text-gray-300">
                            <div className="flex justify-between items-center bg-gray-50 dark:bg-[#1c1c28] p-3.5 rounded-xl border border-gray-100 dark:border-transparent">
                                <span className="text-gray-500 dark:text-gray-400 font-medium">Serviceability Status</span>
                                {formData.isPincodeServiceable ?
                                    <span className="text-green-700 bg-green-100 dark:bg-green-500/20 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold tracking-wider border border-green-200 dark:border-green-500/30 shadow-sm flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Serviceable
                                    </span> :
                                    <span className="text-red-700 bg-red-100 dark:bg-red-500/20 dark:text-red-400 px-3 py-1 rounded-full text-xs font-bold tracking-wider border border-red-200 dark:border-red-500/30 flex items-center gap-1.5">
                                        ✗ Verify Pincode
                                    </span>
                                }
                            </div>

                            <div className="space-y-3 px-1 py-1">
                                <p className="flex justify-between items-center pb-2 border-b border-gray-50 dark:border-[#2a2a38]/50"><span className="text-gray-500 dark:text-gray-400 font-medium">Origin Warehouse</span> <span className="text-gray-900 dark:text-white font-medium bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-xs">{formData.warehouse}</span></p>
                                <p className="flex justify-between items-center pb-2 border-b border-gray-50 dark:border-[#2a2a38]/50"><span className="text-gray-500 dark:text-gray-400 font-medium">Fulfillment Mode</span> <span className="font-semibold text-gray-900 dark:text-white uppercase tracking-wide text-xs">{formData.shipping_mode}</span></p>
                                <p className="flex justify-between items-center pb-2 border-b border-gray-50 dark:border-[#2a2a38]/50"><span className="text-gray-500 dark:text-gray-400 font-medium">Payment terms</span> <span className={`font-bold px-2 py-0.5 rounded-md text-xs ${formData.payment_mode === 'Prepaid' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>{formData.payment_mode}</span></p>
                                <p className="flex justify-between items-center"><span className="text-gray-500 dark:text-gray-400 font-medium">Gross Weight</span> <span className="font-medium text-gray-900 dark:text-white">{formData.weight} <span className="text-gray-400 text-xs">g</span></span></p>
                            </div>

                            <div className="mt-6 p-5 bg-linear-to-br from-indigo-50 to-white dark:from-[#1c1c28] dark:to-[#22222e] rounded-xl border border-indigo-100 dark:border-accent/30 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
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
                    disabled={loadingPreview || submitting || formData.isPincodeServiceable === false}
                >
                    {submitting ? (
                        <><span className="btn-spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 mr-2 inline-block"></span> Processing...</>
                    ) : (
                        'Confirm & Create Order ➔'
                    )}
                </button>
            </div>
        </div>
    );
}
