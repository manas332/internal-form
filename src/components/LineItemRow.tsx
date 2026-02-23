'use client';

import type { InvoiceItem } from '@/types/invoice';
import type { ZohoItem, ZohoTax } from './steps/InvoiceItemsStep';

interface LineItemRowProps {
    item: InvoiceItem;
    index: number;
    zohoItems?: ZohoItem[];
    zohoTaxes?: ZohoTax[];
    onChange: (index: number, updates: Partial<InvoiceItem>) => void;
    onRemove: (index: number) => void;
    canRemove: boolean;
}

export default function LineItemRow({
    item,
    index,
    zohoItems = [],
    zohoTaxes = [],
    onChange,
    onRemove,
    canRemove,
}: LineItemRowProps) {
    const itemBase = (Number(item.quantity) || 0) * (Number(item.price) || 0);
    const itemTotal = itemBase + (item.tax_amount || 0);

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
                                if (matched.rate) updates.price = matched.rate;
                                if (matched.hsn_or_sac) updates.hsn_or_sac = matched.hsn_or_sac;
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

                <div className="line-item-field line-item-price">
                    <label>Rate (₹) *</label>
                    <input
                        type="number"
                        className="form-input"
                        min="0"
                        step="0.01"
                        value={item.price}
                        onChange={(e) => onChange(index, { price: Number(e.target.value) || 0 })}
                        required
                    />
                </div>

                <div className="line-item-field line-item-tax">
                    <label>Tax</label>
                    <select
                        className="form-input"
                        value={item.tax_id || ''}
                        onChange={(e) => onChange(index, { tax_id: e.target.value })}
                    >
                        <option value="">None</option>
                        {zohoTaxes.map(t => (
                            <option key={t.tax_id} value={t.tax_id}>{t.tax_name} ({t.tax_percentage}%)</option>
                        ))}
                    </select>
                </div>

                <div className="line-item-field line-item-total">
                    <label>Amount</label>
                    <div className="line-item-total-value">
                        ₹{itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        {!!item.tax_amount && <div className="text-xs text-gray-500 font-normal mt-1">+ ₹{item.tax_amount.toFixed(2)} tax</div>}
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
