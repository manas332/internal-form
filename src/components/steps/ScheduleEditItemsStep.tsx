'use client';

import React, { useEffect, useState } from 'react';
import { CombinedFormData } from '@/types/wizard';
import LineItemRow from '@/components/LineItemRow';
import { InvoiceItem, ZohoItem, ZohoTax } from '@/types/invoice';
import { isInterstateOrder, normalizeItemTaxForContext, validateTaxesForOrder } from '@/lib/tax';
import { toast } from 'sonner';

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
    cost_price: 0,
});

export default function ScheduleEditItemsStep({ formData, updateForm, onNext, onPrev }: Props) {
    const [zohoItems, setZohoItems] = useState<ZohoItem[]>([]);
    const [zohoTaxes, setZohoTaxes] = useState<ZohoTax[]>([]);
    const [loading, setLoading] = useState(true);

    const isInterstate = isInterstateOrder(formData.state);

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const [itemsRes, taxesRes] = await Promise.all([
                    fetch('/api/zoho/items'),
                    fetch('/api/zoho/taxes')
                ]);

                if (itemsRes.ok) setZohoItems(await itemsRes.json());
                if (taxesRes.ok) setZohoTaxes(await taxesRes.json());
            } catch (err) {
                console.error("Failed to load catalog data:", err);
                toast.error("Failed to load Zoho item/tax data.");
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    const recalcFromFinalPrice = (
        item: InvoiceItem,
        overrides: Partial<InvoiceItem>,
        taxes: ZohoTax[]
    ): Partial<InvoiceItem> => {
        const merged = { ...item, ...overrides };
        const qty = Number(merged.quantity) || 0;
        
        let finalPricePerUnit = Number(merged.final_price);
        if (!finalPricePerUnit && finalPricePerUnit !== 0) {
            const taxPerUnit = qty > 0 ? (Number(merged.tax_amount) || 0) / qty : 0;
            finalPricePerUnit = (Number(merged.price) || 0) + taxPerUnit;
        }

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

        const totalTaxAmount = taxAmount * qty;
        const itemTotal = preTaxRate * qty;

        return {
            ...overrides,
            final_price: finalPricePerUnit,
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

        const mergedUpdates = { ...updates, ...normalized };
        const needsRecalc = 'final_price' in mergedUpdates || 'tax_id' in mergedUpdates || 'quantity' in mergedUpdates;
        
        const finalUpdates = needsRecalc 
            ? recalcFromFinalPrice(currentItem, mergedUpdates, zohoTaxes) 
            : mergedUpdates;

        newItems[index] = { ...currentItem, ...finalUpdates };
        updateForm({ invoice_items: newItems });
    };

    const addItem = () => updateForm({ invoice_items: [...formData.invoice_items, emptyItem()] });

    const removeItem = (index: number) => {
        updateForm({ invoice_items: formData.invoice_items.filter((_, i) => i !== index) });
    };

    // Keep taxes normalized if interstate/intrastate mismatch detected, 
    // and repair any corrupted data from DB (where price is 0 but final_price exists)
    useEffect(() => {
        if (!zohoTaxes.length || !formData.invoice_items.length) return;

        let anyChanged = false;
        const updated = formData.invoice_items.map((item) => {
            const normalization = normalizeItemTaxForContext({
                item,
                updates: {},
                taxes: zohoTaxes,
                isInterstate,
            });

            let next = { ...item, ...normalization };
            const taxChanged = next.tax_id !== item.tax_id || next.tax_auto_corrected !== item.tax_auto_corrected;
            
            // Repair: Calculate missing price or tax_amount if final_price exists
            // This happens when older/imported orders have incomplete pre-tax prices in DB
            const needsRepair = next.final_price !== undefined && next.final_price > 0 && 
                               (next.price === 0 || next.item_total === 0);

            if (taxChanged || needsRepair) {
                if (next.final_price !== undefined) {
                    // Recalculate price and tax_amount using the existing or corrected tax_id
                    next = { ...next, ...recalcFromFinalPrice(next, {}, zohoTaxes) };
                    anyChanged = true;
                }
            } else if (taxChanged) {
                anyChanged = true;
            }

            return next as InvoiceItem;
        });

        if (anyChanged) {
            updateForm({ invoice_items: updated });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInterstate, zohoTaxes]);

    const handleNext = async () => {
        if (formData.invoice_items.length === 0) {
            toast.error("Order must have at least one item.");
            return;
        }

        for (let i = 0; i < formData.invoice_items.length; i++) {
            const item = formData.invoice_items[i];
            if (!item.name || item.name.trim() === '') {
                toast.error(`Item ${i + 1} Name is required`);
                return;
            }
            if (item.quantity <= 0) {
            if (item.quantity === undefined || item.quantity < 1) {
                toast.error(`Item ${i + 1} Quantity must be greater than 0`);
                return;
            }
            if (item.final_price === undefined || item.final_price < 0) {
                toast.error(`Item ${i + 1} valid Final Price is required`);
                return;
            }
            if (item.cost_price === undefined || item.cost_price === null || item.cost_price <= 0) {
                toast.error(`Item ${i + 1} valid Cost Price is required`);
                return;
            }
        }

        const taxIssues = validateTaxesForOrder(formData.invoice_items, zohoTaxes, isInterstate);
        if (taxIssues.length) {
            taxIssues.forEach((issue) => toast.error(`Item ${issue.index + 1}: ${issue.message}`));
            return;
        }

        setLoading(true);
        try {
            // Immediately patch the DB and Zoho using the unified API endpoint
            const res = await fetch(`/api/orders/${formData.orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoiceItems: formData.invoice_items,
                    discount: formData.discount,
                    discount_format_type: formData.discount_format_type,
                    include_shipping: formData.include_shipping,
                    include_cod: formData.include_cod,
                })
            });
            
            if (!res.ok) {
                throw new Error("Failed to save edited items");
            }

            onNext();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error saving items");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const subtotal = formData.invoice_items.reduce((acc, item) => acc + (item.item_total || 0), 0);
    const totalTax = formData.invoice_items.reduce((acc, item) => acc + (item.tax_amount || 0), 0);
    const shippingCharge = 0; // Delivery is manually added as a line item, so don't double count globally
    const codCharge = formData.include_cod ? 50 : 0;

    const finalItemsPrice = subtotal + totalTax;
    const discountInput = Number(formData.discount) || 0;
    const discountFormat = formData.discount_format_type || 'fixed';
    const appliedDiscountAmount = discountFormat === 'percentage'
        ? (finalItemsPrice * discountInput) / 100
        : discountInput;

    const grandTotal = finalItemsPrice - appliedDiscountAmount + shippingCharge + codCharge;

    if (loading) {
        return (
            <div className="py-16 text-center text-gray-500">
                <div className="btn-spinner border-[3px] border-accent border-t-transparent rounded-full w-8 h-8 mx-auto mb-4"></div>
                <p>Loading Item catalog...</p>
            </div>
        );
    }

    return (
        <div className="form-section animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-6">
                <h3 className="section-title mb-0">
                    <span className="section-icon">✏️</span> Edit Order Items
                </h3>
                <p className="text-sm text-gray-500">Verify items before splitting</p>
            </div>

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
                    + Add Product/Service
                </button>
            </div>

            {/* Adjusting the total values box to track edited items total */}
            <div className="mt-8 pt-6 border-t border-gray-800 totals-grid">
                <div className="totals-left"></div>
                
                <div className="totals-right">
                    <div className="total-row">
                        <span>Items Subtotal (pre-tax)</span>
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

                    <div className="total-row total-grand mt-4 border-t border-gray-100 dark:border-[#2a2a38] pt-2">
                        <span>New Grand Total</span>
                        <span>₹{grandTotal.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-between">
                <button className="btn btn-secondary" onClick={onPrev}>
                    🡨 Back
                </button>
                <button className="btn btn-submit w-auto px-8" onClick={handleNext}>
                    Next: Split & Ship ➔
                </button>
            </div>
        </div>
    );
}
}