'use client';

import type { InvoiceItem } from '@/types/invoice';
import type { ZohoItem, ZohoTax } from './steps/InvoiceItemsStep';

interface LineItemRowProps {
    item: InvoiceItem;
    index: number;
    zohoItems?: ZohoItem[];
    zohoTaxes?: ZohoTax[];
    isInterstate?: boolean;
    onChange: (index: number, updates: Partial<InvoiceItem>) => void;
    onRemove: (index: number) => void;
    canRemove: boolean;
}

export default function LineItemRow({
    item,
    index,
    zohoItems = [],
    zohoTaxes = [],
    isInterstate = true,
    onChange,
    onRemove,
    canRemove,
}: LineItemRowProps) {
    const preTaxRate = Number(item.price) || 0;
    const qty = Number(item.quantity) || 0;
    const preTaxTotal = qty * preTaxRate;
    const taxAmount = item.tax_amount || 0;
    const itemTotal = preTaxTotal + taxAmount;

    return (
        <div className="line-item-row">
            <div className="line-item-number">{index + 1}</div>

            <div className="line-item-fields">
                <div className="line-item-field line-item-name">
                    <label>Item Name *</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Product / service name"
                        list={`zoho-items-${index}`}
                        value={item.name}
                        onChange={(e) => {
                            const val = e.target.value;
                            const updates: Partial<InvoiceItem> = { name: val };

                            // Check if val matches a Zoho item
                            const matched = zohoItems.find(z => z.name === val);
                            if (matched) {
                                // Auto-populate other fields
                                if (matched.description) updates.description = matched.description;
                                if (matched.rate) updates.final_price = matched.rate;
                                if (matched.hsn_or_sac) updates.hsn_or_sac = matched.hsn_or_sac;

                                // Auto-apply tax preference (prefer intra/GST or inter/IGST based on state)
                                const taxSpec = isInterstate ? 'inter' : 'intra';
                                const taxPref = matched.item_tax_preferences?.find(t => t.tax_specification === taxSpec) || matched.item_tax_preferences?.[0];
                                if (taxPref && taxPref.tax_id) {
                                    updates.tax_id = taxPref.tax_id;
                                }
                            }
                            onChange(index, updates);
                        }}
                        required
                    />
                    <datalist id={`zoho-items-${index}`}>
                        {zohoItems.map((z, i) => (
                            <option key={z.item_id || i} value={z.name} />
                        ))}
                    </datalist>
                </div>

                <div className="line-item-field line-item-desc">
                    <label>Description</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Brief description"
                        value={item.description || ''}
                        onChange={(e) => onChange(index, { description: e.target.value })}
                    />
                </div>

                <div className="line-item-field line-item-hsn">
                    <label>HSN/SAC</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="HSN code"
                        value={item.hsn_or_sac || ''}
                        onChange={(e) => onChange(index, { hsn_or_sac: e.target.value })}
                    />
                </div>

                <div className="line-item-field line-item-carat">
                    <label>Carat Size</label>
                    <input
                        type="number"
                        className="form-input"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={item.carat_size ?? ''}
                        onChange={(e) => {
                            const raw = e.target.value;
                            onChange(index, {
                                carat_size: raw === '' ? undefined : Math.round(Number(raw) * 100) / 100,
                            });
                        }}
                    />
                </div>

                <div className="line-item-field line-item-qty">
                    <label>Qty *</label>
                    <input
                        type="number"
                        className="form-input"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(e) => onChange(index, { quantity: Number(e.target.value) || 0 })}
                        required
                    />
                </div>

                {/* Tax selector — required, shown before Final Price so user picks tax first */}
                <div className="line-item-field line-item-tax">
                    <label>Tax *</label>
                    <select
                        className="form-input"
                        value={item.tax_id || ''}
                        onChange={(e) => onChange(index, { tax_id: e.target.value })}
                        required
                    >
                        <option value="" disabled>Select tax…</option>
                        <option value="NO_TAX">No Tax (0%)</option>
                        {zohoTaxes
                            .filter(t => {
                                // Filter dropdown to only show appropriate taxes for the state
                                const name = t.tax_name.toUpperCase();
                                if (isInterstate) {
                                    return name.includes('IGST') || (!name.includes('GST') && t.tax_type === 'tax');
                                } else {
                                    // Intrastate: hide IGST, show GST/CGST/tax_groups
                                    return !name.includes('IGST');
                                }
                            })
                            .map(t => (
                                <option key={t.tax_id} value={t.tax_id}>{t.tax_name} ({t.tax_percentage}%)</option>
                            ))}
                    </select>
                </div>

                {/* User enters the final (tax-inclusive) price per unit */}
                <div className="line-item-field line-item-price">
                    <label>Final Price (₹) *</label>
                    <input
                        type="number"
                        className="form-input"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={item.final_price !== undefined && item.final_price !== 0 ? item.final_price : ''}
                        onChange={(e) => {
                            const raw = e.target.value;
                            onChange(index, { final_price: raw === '' ? undefined : Number(raw) });
                        }}
                        required
                    />
                    {preTaxRate > 0 && taxAmount > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                            Rate: ₹{preTaxRate.toFixed(2)} + Tax: ₹{taxAmount.toFixed(2)}
                        </div>
                    )}
                </div>

                <div className="line-item-field line-item-total">
                    <label>Amount</label>
                    <div className="line-item-total-value">
                        ₹{itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        {!!taxAmount && <div className="text-xs text-gray-500 font-normal mt-1">incl. ₹{taxAmount.toFixed(2)} tax</div>}
                    </div>
                </div>
            </div>

            {canRemove && (
                <button
                    type="button"
                    className="line-item-remove"
                    onClick={() => onRemove(index)}
                    title="Remove item"
                >
                    ✕
                </button>
            )}
        </div>
    );
}
