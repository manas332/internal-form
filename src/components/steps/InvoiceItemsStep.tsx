'use client';

import React, { useEffect, useState } from 'react';

import { CombinedFormData } from '@/types/wizard';
import LineItemRow from '../LineItemRow'; // Reusing existing UI
import { InvoiceItem, ZohoItem, ZohoTax } from '@/types/invoice';
import { toast } from 'sonner';
import { invoiceItemsStepSchema } from '@/lib/validation';
import { isInterstateOrder, normalizeItemTaxForContext, validateTaxesForOrder } from '@/lib/tax';

interface Props {
    formData: CombinedFormData;
    updateForm: (data: Partial<CombinedFormData>) => void;
    onNext: () => void;
    onPrev: () => void;
}

const emptyItem = (): InvoiceItem => ({
    name: '',
    description: '',
    quantity: 1,
    price: 0,
    final_price: undefined,
    tax_id: 'NO_TAX',
    tax_amount: 0,
    item_total: 0,
});

export default function InvoiceItemsStep({ formData, updateForm, onNext, onPrev }: Props) {
    const [zohoItems, setZohoItems] = useState<ZohoItem[]>([]);
    const [zohoTaxes, setZohoTaxes] = useState<ZohoTax[]>([]);

    const isInterstate = isInterstateOrder(formData.state);

    useEffect(() => {
        async function loadData() {
            try {
                const [itemsRes, taxesRes] = await Promise.all([
                    fetch('/api/zoho/items'),
                    fetch('/api/zoho/taxes')
                ]);

                if (itemsRes.ok) {
                    const data = await itemsRes.json();
                    setZohoItems(data);
                }

                if (taxesRes.ok) {
                    const data = await taxesRes.json();
                    setZohoTaxes(data);
                }
            } catch (err) {
                console.error("Failed to load zoho data:", err);
            }
        }
        loadData();
    }, []);

    /**
     * Reverse-calculates pre-tax rate and tax amount from the user-supplied
     * tax-inclusive final price.
     *
     * Formula: pre_tax_rate = final_price / (1 + tax_pct / 100)
     *          tax_amount    = final_price - pre_tax_rate
     */
    const recalcFromFinalPrice = (
        item: InvoiceItem,
        overrides: Partial<InvoiceItem>,
        taxes: ZohoTax[]
    ): Partial<InvoiceItem> => {
        const merged = { ...item, ...overrides };

        const qty = Number(merged.quantity) || 0;
        const finalPricePerUnit = Number(merged.final_price) || 0;
        const taxId = merged.tax_id ?? '';

        let preTaxRate = finalPricePerUnit;
        let taxAmount = 0;

        if (taxId && taxId !== 'NO_TAX') {
            const foundTax = taxes.find(t => t.tax_id === taxId);
            if (foundTax && foundTax.tax_percentage > 0) {
                preTaxRate = finalPricePerUnit / (1 + foundTax.tax_percentage / 100);
                taxAmount = finalPricePerUnit - preTaxRate;
            }
        }

        // Multiply tax amount by quantity for the line total
        const totalTaxAmount = taxAmount * qty;
        const itemTotal = preTaxRate * qty; // pre-tax subtotal for this line

        return {
            ...overrides,
            price: preTaxRate,
            tax_amount: totalTaxAmount,
            item_total: itemTotal,
        };
    };

    const handleItemChange = (index: number, updates: Partial<InvoiceItem>) => {
        const newItems = [...formData.invoice_items];
        const currentItem = newItems[index];
        const normalized = normalizeItemTaxForContext({
            item: currentItem,
            updates,
            taxes: zohoTaxes,
            isInterstate,
        });

        const mergedUpdates: Partial<InvoiceItem> = { ...updates, ...normalized };

        // Determine if the update involves anything that affects the reverse calculation
        const needsRecalc =
            'final_price' in mergedUpdates ||
            'tax_id' in mergedUpdates ||
            'quantity' in mergedUpdates;

        let finalUpdates: Partial<InvoiceItem> = mergedUpdates;

        if (needsRecalc) {
            finalUpdates = recalcFromFinalPrice(currentItem, mergedUpdates, zohoTaxes);
        }

        newItems[index] = { ...currentItem, ...finalUpdates };
        updateForm({ invoice_items: newItems });
    };

    const addItem = () => {
        updateForm({ invoice_items: [...formData.invoice_items, emptyItem()] });
    };

    const removeItem = (index: number) => {
        updateForm({ invoice_items: formData.invoice_items.filter((_, i) => i !== index) });
    };

    const subtotal = formData.invoice_items.reduce((acc, item) => acc + (item.item_total || 0), 0);
    const totalTax = formData.invoice_items.reduce((acc, item) => acc + (item.tax_amount || 0), 0);
    const shippingCharge = formData.include_shipping ? 100 : 0;
    const codCharge = formData.include_cod ? 50 : 0;

    const finalItemsPrice = subtotal + totalTax;
    const discountInput = Number(formData.discount) || 0;
    const discountFormat = formData.discount_format_type || 'fixed';
    const appliedDiscountAmount = discountFormat === 'percentage'
        ? (finalItemsPrice * discountInput) / 100
        : discountInput;

    const grandTotal = finalItemsPrice - appliedDiscountAmount + shippingCharge + codCharge;

    // Add initial item if empty
    useEffect(() => {
        if (formData.invoice_items.length === 0) {
            addItem();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.invoice_items.length]);

    // When the order flips between inter/intra state or taxes load, normalize taxes on all items.
    useEffect(() => {
        if (!zohoTaxes.length || !formData.invoice_items.length) return;

        const updated = formData.invoice_items.map((item) => {
            const normalization = normalizeItemTaxForContext({
                item,
                updates: {},
                taxes: zohoTaxes,
                isInterstate,
            });

            let next: InvoiceItem = { ...item, ...normalization };

            // If tax changed and we have a final_price, recompute amounts
            if (normalization.tax_id && normalization.tax_id !== item.tax_id && item.final_price) {
                const recalc = recalcFromFinalPrice(item, { tax_id: normalization.tax_id }, zohoTaxes);
                next = { ...next, ...recalc };
            }

            return next;
        });

        const changed = updated.some((item, idx) => {
            const prev = formData.invoice_items[idx];
            return (
                prev.tax_id !== item.tax_id ||
                prev.tax_auto_corrected !== item.tax_auto_corrected ||
                prev.tax_correction_note !== item.tax_correction_note
            );
        });

        if (changed) {
            updateForm({ invoice_items: updated });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInterstate, zohoTaxes]);

    const handleNext = () => {
        const result = invoiceItemsStepSchema.safeParse(formData);
        if (!result.success) {
            const issues = result.error.issues;
            issues.forEach((issue) => {
                // path looks like ["invoice_items", 0, "name"]
                const path = issue.path;
                let label = issue.message;

                if (path[0] === 'invoice_items' && typeof path[1] === 'number') {
                    const itemNum = (path[1] as number) + 1;
                    const field = (path[2] as string | undefined) || '';
                    const fieldLabel = field
                        ? field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                        : '';
                    label = fieldLabel
                        ? `Item ${itemNum} — ${fieldLabel}: ${issue.message}`
                        : `Item ${itemNum}: ${issue.message}`;
                }

                toast.error(label);
            });
            return;
        }

        // Additional safety: verify that no line violates interstate/intrastate GST rules.
        const taxIssues = validateTaxesForOrder(formData.invoice_items, zohoTaxes, isInterstate);
        if (taxIssues.length) {
            taxIssues.forEach((issue) => {
                const itemNum = issue.index + 1;
                toast.error(`Item ${itemNum}: ${issue.message}`);
            });
            return;
        }

        onNext();
    };

    return (
        <div className="form-section animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="section-title">
                <span className="section-icon">📦</span> Invoice Line Items
            </h3>

            <div className="line-items-container">
                {formData.invoice_items.map((item, index) => (
                    <LineItemRow
                        key={index}
                        index={index}
                        item={item}
                        zohoItems={zohoItems}
                        zohoTaxes={zohoTaxes}
                        isInterstate={isInterstate}
                        onChange={handleItemChange}
                        onRemove={() => removeItem(index)}
                        canRemove={formData.invoice_items.length > 1}
                    />
                ))}

                <button type="button" className="btn-add-item" onClick={addItem}>
                    + Add another item
                </button>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-800 totals-grid">
                <div className="totals-left">
                    <div className="form-group">
                        <label>Notes</label>
                        <textarea
                            className="form-input form-textarea"
                            value={formData.notes}
                            onChange={(e) => updateForm({ notes: e.target.value })}
                        />
                    </div>
                </div>

                <div className="totals-right">
                    <div className="total-row">
                        <span>Subtotal (pre-tax)</span>
                        <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    {totalTax > 0 && (
                        <div className="total-row">
                            <span>Total Tax</span>
                            <span>₹{totalTax.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="total-row font-medium text-gray-700 dark:text-gray-300">
                        <span>Final Price (incl. tax)</span>
                        <span>₹{finalItemsPrice.toFixed(2)}</span>
                    </div>
                    <div className="total-row items-start mt-2 border-t border-gray-100 dark:border-[#2a2a38] pt-3 pb-2">
                        <div className="flex flex-col gap-2">
                            <span className="text-gray-700 dark:text-gray-300">Discount</span>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => updateForm({ discount_format_type: 'percentage' })}
                                    className={`btn-toggle ${formData.discount_format_type === 'percentage' ? 'active' : ''}`}
                                >%</button>
                                <button
                                    type="button"
                                    onClick={() => updateForm({ discount_format_type: 'fixed' })}
                                    className={`btn-toggle ${formData.discount_format_type === 'fixed' || !formData.discount_format_type ? 'active' : ''}`}
                                >₹</button>
                            </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                            <div className="relative">
                                <input
                                    type="number"
                                    className="form-input w-32 text-right py-1 pr-8"
                                    value={formData.discount}
                                    onChange={(e) => updateForm({ discount: e.target.value })}
                                    placeholder="0.00"
                                    step="0.01"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                                    {(formData.discount_format_type === 'percentage') ? '%' : '₹'}
                                </span>
                            </div>
                            {formData.discount_format_type === 'percentage' && appliedDiscountAmount > 0 && (
                                <span className="text-xs text-green-600 dark:text-green-500 font-medium">-₹{appliedDiscountAmount.toFixed(2)}</span>
                            )}
                        </div>
                    </div>

                    <div className="total-row items-center mt-2">
                        <label className="flex items-center gap-2 cursor-pointer cursor-checkbox">
                            <input
                                type="checkbox"
                                checked={formData.include_shipping ?? true}
                                onChange={(e) => updateForm({ include_shipping: e.target.checked })}
                                className="form-checkbox h-4 w-4 text-accent rounded border-gray-300 dark:border-gray-600 focus:ring-accent"
                            />
                            <span className="text-sm">Delivery Charges (₹100 incl. 18% GST)</span>
                        </label>
                        <span>{formData.include_shipping ? '₹100.00' : '₹0.00'}</span>
                    </div>

                    <div className="total-row items-center border-b border-gray-100 dark:border-[#2a2a38] pb-2 mb-2">
                        <label className="flex items-center gap-2 cursor-pointer cursor-checkbox">
                            <input
                                type="checkbox"
                                checked={formData.include_cod ?? false}
                                onChange={(e) => updateForm({ include_cod: e.target.checked })}
                                className="form-checkbox h-4 w-4 text-accent rounded border-gray-300 dark:border-gray-600 focus:ring-accent"
                            />
                            <span className="text-sm">COD Charges (₹50)</span>
                        </label>
                        <span>{formData.include_cod ? '₹50.00' : '₹0.00'}</span>
                    </div>

                    <div className="total-row items-center border-b border-gray-100 dark:border-[#2a2a38] pb-2 mb-2">
                        <span className="text-sm font-medium">Payment Mode *</span>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={formData.payment_mode === 'Prepaid'}
                                    onChange={() => updateForm({ payment_mode: 'Prepaid' })}
                                    className="accent-accent"
                                />
                                <span className="text-sm">Prepaid</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    checked={formData.payment_mode === 'COD'}
                                    onChange={() => updateForm({ payment_mode: 'COD' })}
                                    className="accent-accent"
                                />
                                <span className="text-sm">COD</span>
                            </label>
                        </div>
                    </div>

                    <div className="total-row total-grand">
                        <span>Invoice Total</span>
                        <span>₹{grandTotal.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-between">
                <button className="btn btn-secondary" onClick={onPrev}>
                    🡨 Back
                </button>
                <button
                    className="btn btn-submit w-auto px-8"
                    onClick={handleNext}
                >
                    Next: Shipping ➔
                </button>
            </div>
        </div>
    );
}
