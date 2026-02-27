'use client';

import { useState } from 'react';
import { CombinedFormData } from '@/types/wizard';
import stateCodesData from '@/data/state-codes.json';
import { isInterstateOrder, get18PctTaxId } from '@/lib/tax';

interface Props {
    formData: CombinedFormData;
    updateForm: (data: Partial<CombinedFormData>) => void;
    onNext: () => void;
    onPrev: () => void;
}

export default function OrderPreviewStep({ formData, updateForm, onNext, onPrev }: Props) {
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

    const subtotal = formData.invoice_items.reduce((acc, item) => acc + (item.item_total || 0), 0);
    const totalTax = formData.invoice_items.reduce((acc, item) => acc + (item.tax_amount || 0), 0);
    const totalDiscount = Number(formData.discount) || 0;
    const totalAdjustment = Number(formData.adjustment) || 0;
    const shippingCharge = formData.include_shipping ? 100 : 0;
    const codCharge = formData.include_cod ? 50 : 0;
    const combinedShippingCharge = shippingCharge + codCharge;
    const grandTotal = subtotal + totalTax - totalDiscount + totalAdjustment + combinedShippingCharge;

    const finalInvoiceItems = [...formData.invoice_items];

    if (shippingCharge > 0) {
        finalInvoiceItems.push(buildChargeItem('Delivery Charges', 100, 'Delivery and handling'));
    }

    if (codCharge > 0) {
        finalInvoiceItems.push(buildChargeItem('COD Charges', 50, 'Cash on Delivery fee'));
    }


    const handleConfirm = async () => {
        setSubmitting(true);
        setErrorMsg('');

        try {
            // 1. Create Zoho Invoice
            const invoicePayload = {
                customer_id: formData.customer_id,
                date: formData.date,
                // billing_address is NOT sent here — Zoho auto-pulls it from the
                // customer record, which CustomerStep already updates before we get here.
                reference_number: formData.reference_number || undefined,
                gst_treatment: formData.gst_treatment,
                salesperson_name: formData.salesperson_name || undefined,
                place_of_supply: stateCodesData.find(s => s.name === formData.state)?.code || formData.state,
                invoice_items: finalInvoiceItems,
                discount: Number(formData.discount) || undefined,
                discount_type: formData.discount_type,
                adjustment: Number(formData.adjustment) || undefined,
                adjustment_description: formData.adjustment_description || undefined,
                notes: formData.notes,
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

            // 2. Save Order to Database
            const orderPayload = {
                zohoInvoiceId: createdInvoiceId,
                orderId: createdInvoiceNumber,
                customerDetails: {
                    customer_name: formData.customer_name,
                    email: formData.email,
                    phone: formData.phone,
                    country_code: formData.country_code,
                    address: formData.address,
                    city: formData.city,
                    state: formData.state,
                    country: formData.country,
                    pincode: formData.pincode,
                },
                // Persist the raw UI items, including optional descriptions,
                // so the schedule-order wizard can see them even though we
                // no longer send description to Zoho.
                invoiceItems: formData.invoice_items,
                salespersonName: formData.salesperson_name,
                status: 'PENDING_SHIPPING'
            };

            const orderRes = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderPayload)
            });

            if (!orderRes.ok) {
                const orderError = await orderRes.json();
                console.warn('Failed to save to MongoDB:', orderError);
                // We proceed anyway as Zoho invoice was created. 
            }

            // 3. Update state and proceed
            updateForm({
                invoiceId: createdInvoiceId,
                orderId: createdInvoiceNumber,
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
                <span className="section-icon">🔍</span> Invoice Review
            </h3>

            {errorMsg && (
                <div className="form-error">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    {errorMsg}
                </div>
            )}

            <div className="w-full">
                {/* Invoice Details */}
                <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-2xl p-6 shadow-sm">
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
                        <h5 className="text-xs uppercase text-gray-400 mb-3 font-bold tracking-wider">Line Items ({finalInvoiceItems.length})</h5>

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
                                    {finalInvoiceItems.map((it, idx) => {
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
                        <div className="flex justify-between font-bold text-gray-900 dark:text-white pt-3 border-t border-gray-200 dark:border-[#2a2a38] border-dashed text-lg px-2 bg-gray-50 dark:bg-transparent rounded-b-lg">
                            <span>Grand Total</span>
                            <span className="text-accent">₹{grandTotal.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-between">
                <button className="btn btn-secondary" onClick={onPrev} disabled={submitting}>
                    🡨 Back
                </button>
                <button
                    className="btn btn-submit w-auto px-8"
                    onClick={handleConfirm}
                    disabled={submitting}
                >
                    {submitting ? (
                        <><span className="btn-spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 mr-2 inline-block"></span> Creating Invoice...</>
                    ) : (
                        'Confirm & Create Invoice ➔'
                    )}
                </button>
            </div>
        </div>
    );
}
