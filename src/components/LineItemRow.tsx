'use client';

import type { InvoiceItem, ZohoItem, ZohoTax } from '@/types/invoice';

interface HsnCategory {
    code: string;
    name: string;
    description: string;
}

const HSN_CATEGORIES: HsnCategory[] = [
    {
        code: '14049070',
        name: 'Rudrakshas',
        description: 'All Mukhi Rudrakshas, Rudraksha Malas, and other plant-based beads (like Tulsi Malas).',
    },
    {
        code: '05080010',
        name: 'Gemstones and Raw Crystals',
        description: 'Precious and semi-precious stones (Ruby, Sapphire, Coral, Pearls), Geodes, and raw crystal clusters.',
    },
    {
        code: '71179090',
        name: 'Bracelets, Malas and Decorative Items',
        description: 'Crystal bracelets (Amethyst, Pyrite, etc.), imitation jewelry, 7 Chakra items, and decorative crystal items (rollers, plates).',
    },
    {
        code: '83062990',
        name: 'Vastu Metal',
        description: 'Vastu items made of general base metals, iron, or mixed alloys (e.g., metal pyramids, basic statuettes).',
    },
    {
        code: '74198090',
        name: 'Vastu Copper/Brass',
        description: 'Premium Vastu items specifically made of copper or brass (e.g., Copper Yantras, Brass Tortoises).',
    },
    {
        code: '44209090',
        name: 'Vastu Wooden',
        description: 'Vastu items carved from wood (e.g., Wooden frames, Shriparni wood items).',
    },
    {
        code: '39269090',
        name: 'Miscellaneous Goods',
        description: "Catch-all for physical items that don't fit above (e.g., resin items, plastic/acrylic stands, mixed-material novelties).",
    },
    {
        code: '999591',
        name: 'Poojas and Services',
        description: 'Astrological consultations, Puja services, and other spiritual services (SAC code).',
    },
    {
        code: '999799',
        name: 'Miscellaneous Services',
        description: 'Catch-all for any other non-physical service charges not covered elsewhere (SAC code).',
    },
];

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
                                updates.zoho_item_id = matched.item_id;
                                if (matched.description) updates.description = matched.description;
                                if (matched.rate) updates.final_price = matched.rate;
                                if (matched.hsn_or_sac) updates.hsn_or_sac = matched.hsn_or_sac;

                                // Auto-apply tax preference (prefer intra/GST or inter/IGST based on state)
                                const taxSpec = isInterstate ? 'inter' : 'intra';
                                const taxPref = matched.item_tax_preferences?.find(t => t.tax_specification === taxSpec) || matched.item_tax_preferences?.[0];
                                if (taxPref && taxPref.tax_id) {
                                    updates.tax_id = taxPref.tax_id;
                                }
                            } else {
                                // Name edited away from a known item — clear the catalog reference
                                updates.zoho_item_id = '';
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
                    {/* Status badge */}
                    {item.name && (
                        item.zoho_item_id
                            ? <span className="line-item-badge line-item-badge--zoho">✓ In Zoho</span>
                            : <span className="line-item-badge line-item-badge--new">★ New product</span>
                    )}
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
                    <label>HSN/SAC{!item.zoho_item_id && ' *'}</label>
                    <select
                        className="form-input"
                        value={item.hsn_or_sac || ''}
                        disabled={!!item.zoho_item_id}
                        title={
                            item.zoho_item_id
                                ? 'HSN is pre-set from Zoho for existing products'
                                : (HSN_CATEGORIES.find(c => c.code === item.hsn_or_sac)?.description ?? 'Select HSN/SAC category')
                        }
                        onChange={(e) => {
                            const code = e.target.value;
                            onChange(index, { hsn_or_sac: code });
                        }}
                    >
                        <option value="">— Select HSN/SAC —</option>
                        {HSN_CATEGORIES.map(cat => (
                            <option key={cat.code} value={cat.code} title={cat.description}>
                                {cat.name} ({cat.code})
                            </option>
                        ))}
                        {/* Show unknown codes (auto-filled from Zoho) as a labelled fallback */}
                        {item.hsn_or_sac && !HSN_CATEGORIES.find(c => c.code === item.hsn_or_sac) && (
                            <option value={item.hsn_or_sac}>{item.hsn_or_sac}</option>
                        )}
                    </select>
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
                    {item.tax_auto_corrected && item.tax_correction_note && (
                        <div
                            className="mt-1 text-xs rounded-md px-2 py-1"
                            style={{
                                background: 'rgba(248, 113, 113, 0.08)',
                                border: '1px solid rgba(248, 113, 113, 0.35)',
                                color: '#fecaca',
                            }}
                        >
                            {item.tax_correction_note}
                        </div>
                    )}
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
