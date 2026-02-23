'use client';

import { useState, useEffect } from 'react';
import { CombinedFormData } from '@/types/wizard';
import { ShipmentData } from '@/types/delhivery';
import stateCodesData from '@/data/state-codes.json';

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

    const subtotal = formData.invoice_items.reduce((acc, item) => acc + (item.item_total || 0), 0);
    const totalTax = formData.invoice_items.reduce((acc, item) => acc + (item.tax_amount || 0), 0);
    const totalDiscount = Number(formData.discount) || 0;
    const totalAdjustment = Number(formData.adjustment) || 0;
    const grandTotal = subtotal + totalTax - totalDiscount + totalAdjustment;

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
            const invoicePayload = {
                customer_id: formData.customer_id,
                date: formData.date,
                due_date: formData.due_date || undefined,
                reference_number: formData.reference_number || undefined,
                gst_treatment: formData.gst_treatment,
                salesperson_name: formData.salesperson_name || undefined,
                gst_no: undefined, // removed as per user sync
                place_of_supply: stateCodesData.find(s => s.name === formData.state)?.code || formData.state,
                invoice_items: formData.invoice_items,
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

            const shipmentData: ShipmentData = {
                name: formData.customer_name,
                add: formData.address,
                pin: parseInt(formData.pincode, 10), // Cast to integer per Delhivery API doc
                city: formData.city,
                state: formData.state,
                country: formData.country,
                phone: formData.phone,
                order: createdInvoiceNumber, // Use Zoho Invoice Number as Order ID
                payment_mode: formData.payment_mode,
                total_amount: zohoCalculatedTotal,
                cod_amount: formData.payment_mode === 'COD' ? zohoCalculatedTotal : 0,
                weight: formData.weight,
                shipping_mode: formData.shipping_mode,
                products_desc: formData.products_desc,
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

            const finalShipmentPayload = {
                ...shipmentData,
                // Add return address explicitly as missing this often triggers the Delhivery backend NoneType end_date error
                // Add return address explicitly as missing this often triggers the Delhivery backend NoneType end_date error
                // The user clarified replacing the return info with exactly the pickup info solves it.
                return_name: "Humara Pandit",
                return_pin: 302001,
                return_city: "Jaipur",
                return_phone: "9876543210",
                return_state: "Rajasthan",
                return_add: formData.warehouse as string,
                return_country: "India"
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
                <div className="py-12 text-center text-gray-400">
                    <div className="btn-spinner border-2 border-accent border-t-transparent rounded-full w-8 h-8 mx-auto mb-4"></div>
                    Loading shipping estimates...
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                    {/* Left Column - Invoice Details */}
                    <div className="bg-[#16161f] border border-[#2a2a38] rounded-xl p-5">
                        <h4 className="text-accent font-semibold mb-4 border-b border-[#2a2a38] pb-2">Invoice Details</h4>

                        <div className="text-sm space-y-2 text-gray-300">
                            <p><span className="text-gray-500 w-24 inline-block">Customer:</span> <strong className="text-white">{formData.customer_name}</strong></p>
                            <p><span className="text-gray-500 w-24 inline-block">Address:</span> {formData.address}</p>
                            <p><span className="text-gray-500 w-24 inline-block">City/State:</span> {formData.city}, {formData.state}</p>
                            <p><span className="text-gray-500 w-24 inline-block">Pincode:</span> {formData.pincode}</p>
                            <p><span className="text-gray-500 w-24 inline-block">Phone:</span> {formData.phone}</p>
                        </div>

                        <div className="mt-5 pt-4 border-t border-[#2a2a38]">
                            <h5 className="text-xs uppercase text-gray-500 mb-2 font-medium">Items ({formData.invoice_items.length})</h5>
                            <ul className="text-sm space-y-1 mb-4">
                                {formData.invoice_items.map((it, idx) => (
                                    <li key={idx} className="flex justify-between text-gray-300">
                                        <span>
                                            {it.quantity}x {it.name}
                                            {!!it.tax_amount && <span className="text-gray-500 text-xs ml-2">+ tax</span>}
                                        </span>
                                        <span>₹{((it.item_total || 0) + (it.tax_amount || 0)).toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                            {totalTax > 0 && (
                                <div className="flex justify-between text-gray-400 text-sm pb-2">
                                    <span>Total Tax</span>
                                    <span>₹{totalTax.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between font-bold text-white pt-2 border-t border-[#2a2a38] border-dashed">
                                <span>Grand Total</span>
                                <span>₹{grandTotal.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Shipping Details */}
                    <div className="bg-[#16161f] border border-[#2a2a38] rounded-xl p-5">
                        <h4 className="text-accent font-semibold mb-4 border-b border-[#2a2a38] pb-2">Shipping Details</h4>

                        <div className="text-sm space-y-3 text-gray-300">
                            <div className="flex justify-between items-center bg-[#1c1c28] p-2 rounded">
                                <span className="text-gray-500">Serviceability:</span>
                                {formData.isPincodeServiceable ?
                                    <span className="text-green-500 font-medium">✓ Serviceable</span> :
                                    <span className="text-red-500 font-medium">✗ Verify Pincode</span>
                                }
                            </div>

                            <p><span className="text-gray-500 w-32 inline-block">Warehouse:</span> <span className="text-white">{formData.warehouse}</span></p>
                            <p><span className="text-gray-500 w-32 inline-block">Mode:</span> {formData.shipping_mode} / {formData.payment_mode}</p>
                            <p><span className="text-gray-500 w-32 inline-block">Weight:</span> {formData.weight}g</p>

                            <div className="mt-4 p-4 bg-gradient-to-br from-[#1c1c28] to-[#22222e] rounded-lg border border-accent/20">
                                <h5 className="text-xs uppercase text-accent mb-3 font-semibold tracking-wider">Delhivery Estimates</h5>
                                <div className="space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Est. Shipping Cost:</span>
                                        <span className="font-semibold text-white">{shippingCost ? `₹${shippingCost}` : 'Calculating...'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Expected Delivery:</span>
                                        <span className="font-semibold text-white">{expectedTat ? new Date(expectedTat).toLocaleDateString() : 'Calculating...'}</span>
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
