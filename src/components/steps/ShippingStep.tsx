'use client';

import { CombinedFormData } from '@/types/wizard';
import { DELHIIVERY_WAREHOUSES } from '@/config/warehouses';
import { toast } from 'sonner';
import { shippingStepSchema } from '@/lib/validation';

interface Props {
    formData: CombinedFormData;
    updateForm: (data: Partial<CombinedFormData>) => void;
    onNext: () => void;
    onPrev: () => void;
}

export default function ShippingStep({ formData, updateForm, onNext, onPrev }: Props) {

    const handleNext = () => {
        const result = shippingStepSchema.safeParse(formData);
        if (!result.success) {
            toast.error(result.error.issues[0].message);
            return;
        }
        onNext();
    };

    return (
        <div className="form-section animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="section-title">
                <span className="section-icon">🚚</span> Delhivery Shipping Details
            </h3>

            <div className="form-grid-2">
                <div className="form-group">
                    <label>Pickup Location (Warehouse) *</label>
                    <select
                        className="form-input"
                        value={formData.warehouse}
                        onChange={(e) => updateForm({ warehouse: e.target.value })}
                    >
                        {DELHIIVERY_WAREHOUSES.map((w) => (
                            <option key={w} value={w}>{w}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>Shipping Mode</label>
                    <div className="flex gap-4 mt-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={formData.shipping_mode === 'Surface'}
                                onChange={() => updateForm({ shipping_mode: 'Surface' })}
                                className="accent-accent"
                            />
                            <span className="text-sm">Surface</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                checked={formData.shipping_mode === 'Express'}
                                onChange={() => updateForm({ shipping_mode: 'Express' })}
                                className="accent-accent"
                            />
                            <span className="text-sm">Express</span>
                        </label>
                    </div>
                </div>

                <div className="form-group">
                    <label>Payment Mode</label>
                    <div className="flex gap-4 mt-1">
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
                            <span className="text-sm">Cash on Delivery (COD)</span>
                        </label>
                    </div>
                </div>

                <div className="form-group">
                    <label>Fragile Shipment?</label>
                    <div className="flex items-center gap-2 h-10">
                        <input
                            type="checkbox"
                            checked={formData.fragile}
                            onChange={(e) => updateForm({ fragile: e.target.checked })}
                            className="w-4 h-4 accent-accent rounded"
                        />
                        <span className="text-sm text-gray-300">Yes, handle with care</span>
                    </div>
                </div>

                <div className="form-group">
                    <label>Chargeable Weight (Grams) *</label>
                    <input
                        className="form-input"
                        type="number"
                        value={formData.weight || ''}
                        onChange={(e) => updateForm({ weight: Number(e.target.value) })}
                        placeholder="e.g. 500"
                    />
                </div>

                <div className="form-group">
                    <label>Dimensions (cm) - Optional</label>
                    <div className="flex gap-2">
                        <input
                            className="form-input flex-1"
                            type="number"
                            placeholder="L"
                            value={formData.length || ''}
                            onChange={(e) => updateForm({ length: Number(e.target.value) })}
                        />
                        <input
                            className="form-input flex-1"
                            type="number"
                            placeholder="W"
                            value={formData.width || ''}
                            onChange={(e) => updateForm({ width: Number(e.target.value) })}
                        />
                        <input
                            className="form-input flex-1"
                            type="number"
                            placeholder="H"
                            value={formData.height || ''}
                            onChange={(e) => updateForm({ height: Number(e.target.value) })}
                        />
                    </div>
                </div>

                <div className="form-group col-span-1 md:col-span-2">
                    <label>Package Contents Description *</label>
                    <input
                        className="form-input"
                        value={formData.products_desc}
                        onChange={(e) => updateForm({ products_desc: e.target.value })}
                        placeholder="e.g. T-shirts, Books"
                    />
                </div>
            </div>

            {/* Optional Overrides */}
            <div className="mt-8">
                <h4 className="text-gray-900 dark:text-accent font-bold mb-4 border-b border-gray-100 dark:border-[#2a2a38] pb-2 flex items-center gap-2">
                    🏷️ Label Overrides (Optional)
                </h4>
                <p className="text-xs text-gray-500 mb-4">
                    Leave blank to use default safe values (hides seller info, shows "Spritual Items" & calculates final price).
                </p>
                <div className="form-grid-2">
                    <div className="form-group">
                        <label>Custom Sender Name</label>
                        <input
                            className="form-input"
                            value={formData.shipping_seller_name || ''}
                            onChange={(e) => updateForm({ shipping_seller_name: e.target.value })}
                            placeholder="e.g. Vendor"
                        />
                    </div>
                    <div className="form-group">
                        <label>Custom Sender Phone</label>
                        <input
                            className="form-input"
                            value={formData.shipping_seller_phone || ''}
                            onChange={(e) => updateForm({ shipping_seller_phone: e.target.value })}
                            placeholder="e.g. 9876543210"
                        />
                    </div>
                    <div className="form-group col-span-1 md:col-span-2">
                        <label>Custom Sender Address</label>
                        <input
                            className="form-input"
                            value={formData.shipping_seller_address || ''}
                            onChange={(e) => updateForm({ shipping_seller_address: e.target.value })}
                            placeholder="e.g. Haryana"
                        />
                    </div>
                    <div className="form-group">
                        <label>Custom Item Description</label>
                        <input
                            className="form-input"
                            value={formData.shipping_item_desc || ''}
                            onChange={(e) => updateForm({ shipping_item_desc: e.target.value })}
                            placeholder='Default: "Spritual Items"'
                        />
                    </div>
                    <div className="form-group">
                        <label>Custom Final Price (₹)</label>
                        <input
                            className="form-input"
                            type="number"
                            value={formData.shipping_final_price === undefined ? '' : formData.shipping_final_price}
                            onChange={(e) => updateForm({ shipping_final_price: e.target.value ? Number(e.target.value) : undefined })}
                            placeholder="Defaults to invoice total"
                        />
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
                    Preview & Calculate Cost ➔
                </button>
            </div>
        </div>
    );
}
