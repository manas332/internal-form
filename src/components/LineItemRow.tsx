'use client';

import type { InvoiceItem } from '@/types/invoice';

interface LineItemRowProps {
    item: InvoiceItem;
    index: number;
    onChange: (index: number, field: keyof InvoiceItem, value: string | number) => void;
    onRemove: (index: number) => void;
    canRemove: boolean;
}

export default function LineItemRow({
    item,
    index,
    onChange,
    onRemove,
    canRemove,
}: LineItemRowProps) {
    const itemTotal = (Number(item.quantity) || 0) * (Number(item.price) || 0);

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
                        value={item.name}
                        onChange={(e) => onChange(index, 'name', e.target.value)}
                        required
                    />
                </div>

                <div className="line-item-field line-item-desc">
                    <label>Description</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Brief description"
                        value={item.description || ''}
                        onChange={(e) => onChange(index, 'description', e.target.value)}
                    />
                </div>

                <div className="line-item-field line-item-hsn">
                    <label>HSN/SAC</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="HSN code"
                        value={item.hsn_or_sac || ''}
                        onChange={(e) => onChange(index, 'hsn_or_sac', e.target.value)}
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
                        onChange={(e) => onChange(index, 'quantity', e.target.value)}
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
                        onChange={(e) => onChange(index, 'price', e.target.value)}
                        required
                    />
                </div>

                <div className="line-item-field line-item-total">
                    <label>Amount</label>
                    <div className="line-item-total-value">
                        ₹{itemTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
