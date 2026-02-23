'use client';

import React, { useEffect, useState } from 'react';

import { CombinedFormData } from '@/types/wizard';
import LineItemRow from '../LineItemRow'; // Reusing existing UI
import { InvoiceItem } from '@/types/invoice';
import { toast } from 'sonner';
import { invoiceItemsStepSchema } from '@/lib/validation';

// Added a global type for brevity; in a real app this would go to a types file
export interface ZohoItem {
    item_id: string;
    name: string;
    description: string;
    rate: number;
    hsn_or_sac: string;
}

export interface ZohoTax {
    tax_id: string;
    tax_name: string;
    tax_percentage: number;
    tax_type: string;
}

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
});

export default function InvoiceItemsStep({ formData, updateForm, onNext, onPrev }: Props) {
    const [zohoItems, setZohoItems] = useState<ZohoItem[]>([]);
    const [zohoTaxes, setZohoTaxes] = useState<ZohoTax[]>([]);

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

    const handleItemChange = (index: number, updates: Partial<InvoiceItem>) => {
        const newItems = [...formData.invoice_items];
        newItems[index] = { ...newItems[index], ...updates };

        // Auto calculate item total and tax
        const q = Number(newItems[index].quantity) || 0;
        const p = Number(newItems[index].price) || 0;
        const d = Number(newItems[index].discount) || 0;

        const itemBaseVal = (q * p) - d;

        // Recalculate tax
        let taxAmt = 0;
        if (newItems[index].tax_id) {
            const foundTax = zohoTaxes.find(t => t.tax_id === newItems[index].tax_id);
            if (foundTax) {
                taxAmt = itemBaseVal * (foundTax.tax_percentage / 100);
            }
        }

        newItems[index].tax_amount = taxAmt;
        newItems[index].item_total = itemBaseVal;

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
    const totalDiscount = Number(formData.discount) || 0;
    const totalAdjustment = Number(formData.adjustment) || 0;
    const grandTotal = subtotal + totalTax - totalDiscount + totalAdjustment;

    // Add initial item if empty
    // Add initial item if empty
    useEffect(() => {
        if (formData.invoice_items.length === 0) {
            addItem();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.invoice_items.length]);

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
                        <span>Subtotal</span>
                        <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="total-row items-center">
                        <span>Discount (Overall)</span>
                        <input
                            type="number"
                            className="form-input w-32 text-right py-1"
                            value={formData.discount}
                            onChange={(e) => updateForm({ discount: e.target.value })}
                            placeholder="0.00"
                        />
                    </div>
                    {totalTax > 0 && (
                        <div className="total-row">
                            <span>Total Tax</span>
                            <span>₹{totalTax.toFixed(2)}</span>
                        </div>
                    )}
                    <div className="total-row items-center">
                        <span className="flex-1">Adjustment</span>
                        <input
                            className="form-input w-24 text-xs mr-2 py-1"
                            placeholder="Reason"
                            value={formData.adjustment_description}
                            onChange={(e) => updateForm({ adjustment_description: e.target.value })}
                        />
                        <input
                            type="number"
                            className="form-input w-24 text-right py-1"
                            value={formData.adjustment}
                            onChange={(e) => updateForm({ adjustment: e.target.value })}
                            placeholder="0.00"
                        />
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
