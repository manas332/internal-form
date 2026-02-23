'use client';

import { useState } from 'react';
import { CombinedFormData } from '@/types/wizard';
import { GSTTreatment, INDIAN_STATES, INDIAN_STATE_NAMES, SALESPERSONS } from '@/types/invoice';
import CustomerSearch from '../CustomerSearch'; // Reusing the existing component
import stateCodesData from '@/data/state-codes.json';

interface Props {
    formData: CombinedFormData;
    updateForm: (data: Partial<CombinedFormData>) => void;
    onNext: () => void;
}

export default function CustomerStep({ formData, updateForm, onNext }: Props) {
    const [checkingPincode, setCheckingPincode] = useState(false);

    const handlePincodeBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
        const pin = e.target.value;
        if (pin.length !== 6) return;

        setCheckingPincode(true);
        try {
            const res = await fetch(`/api/delhivery/pincode?code=${pin}`);
            const data = await res.json();

            if (data.delivery_codes && data.delivery_codes.length > 0) {
                const deliveryCenter = data.delivery_codes[0].postal_code;

                // Delhivery returns the string name of the state (e.g., "Haryana")
                const delhiveryStateName = deliveryCenter.state || '';
                const delhiveryCity = deliveryCenter.district || deliveryCenter.center || '';

                // Try to find the exact Zoho 2-letter state code using the user-provided JSON
                let mappedStateCode = '';
                const match = stateCodesData.find(
                    (s) => s.name.toLowerCase() === delhiveryStateName.toLowerCase()
                );

                if (match) {
                    mappedStateCode = match.name; // we actually want the full name because INDIAN_STATE_NAMES map values are used in options
                    // The select box uses the full name as the selected value!
                }

                updateForm({
                    isPincodeServiceable: true,
                    city: delhiveryCity,
                    state: mappedStateCode || delhiveryStateName // fallback to raw string if not found
                });
            } else {
                updateForm({ isPincodeServiceable: false });
            }
        } catch (error) {
            console.error('Error checking pincode:', error);
            updateForm({ isPincodeServiceable: false });
        } finally {
            setCheckingPincode(false);
        }
    };

    const isFormValid = formData.customer_name && formData.phone && formData.address && formData.pincode && formData.date && formData.isPincodeServiceable !== false;

    return (
        <div className="form-section animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="section-title">
                <span className="section-icon">👤</span> Customer & Invoice Details
            </h3>

            <div className="mb-6">
                <label className="text-sm font-medium text-gray-400 mb-2 block">Search Existing Customer</label>
                <CustomerSearch
                    onSelect={(customer) => {
                        updateForm({
                            customer_id: customer.customer_id,
                            customer_name: customer.display_name || '',
                            email: customer.email || '',
                            phone: '', // Need to ask user, zoho response might not have phone at root
                            gst_treatment: customer.gst_treatment || 'consumer',
                        });
                    }}
                    onClear={() => updateForm({ customer_id: '' })}
                    selectedCustomer={
                        formData.customer_id ? {
                            customer_id: formData.customer_id,
                            display_name: formData.customer_name,
                            email: formData.email,
                            gst_treatment: formData.gst_treatment
                        } : null
                    }
                />
            </div>

            <div className="form-grid-2">
                <div className="form-group">
                    <label>Customer Name *</label>
                    <input
                        className="form-input"
                        value={formData.customer_name}
                        onChange={(e) => updateForm({ customer_name: e.target.value })}
                        placeholder="John Doe"
                    />
                </div>
                <div className="form-group">
                    <label>Email</label>
                    <input
                        className="form-input"
                        type="email"
                        value={formData.email}
                        onChange={(e) => updateForm({ email: e.target.value })}
                        placeholder="john@example.com"
                    />
                </div>
                <div className="form-group">
                    <label>Phone *</label>
                    <input
                        className="form-input"
                        value={formData.phone}
                        onChange={(e) => updateForm({ phone: e.target.value })}
                        placeholder="9876543210"
                        maxLength={10}
                    />
                </div>
                <div className="form-group">
                    <label>Address *</label>
                    <input
                        className="form-input"
                        value={formData.address}
                        onChange={(e) => updateForm({ address: e.target.value })}
                        placeholder="123 Street Name"
                    />
                </div>

                <div className="form-group relative">
                    <label>Pincode *</label>
                    <input
                        className="form-input"
                        value={formData.pincode}
                        onChange={(e) => {
                            updateForm({ pincode: e.target.value, isPincodeServiceable: null });
                        }}
                        onBlur={handlePincodeBlur}
                        placeholder="110001"
                        maxLength={6}
                    />
                    {checkingPincode && <span className="absolute right-3 top-9 text-xs text-accent">Checking...</span>}
                    {formData.isPincodeServiceable === true && <span className="absolute right-3 top-9 text-xs text-green-500">✓ Serviceable</span>}
                    {formData.isPincodeServiceable === false && <span className="absolute right-3 top-9 text-xs text-red-500">✗ Not Serviceable</span>}
                </div>

                <div className="form-group">
                    <label>City & State</label>
                    <div className="flex gap-2">
                        <input
                            className="form-input flex-1"
                            value={formData.city}
                            onChange={(e) => updateForm({ city: e.target.value })}
                            placeholder="City"
                        />
                        <select
                            className="form-input flex-1"
                            value={formData.state}
                            onChange={(e) => updateForm({ state: e.target.value })}
                        >
                            {INDIAN_STATES.map((stateInfo) => (
                                <option key={stateInfo} value={INDIAN_STATE_NAMES[stateInfo]}>{INDIAN_STATE_NAMES[stateInfo]}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label>Invoice Date *</label>
                    <input
                        className="form-input"
                        type="date"
                        value={formData.date}
                        onChange={(e) => updateForm({ date: e.target.value })}
                    />
                </div>
                <div className="form-group">
                    <label>Salesperson</label>
                    <select
                        className="form-input"
                        value={formData.salesperson_name}
                        onChange={(e) => updateForm({ salesperson_name: e.target.value })}
                    >
                        <option value="">Select Salesperson</option>
                        {SALESPERSONS.map((sp) => (
                            <option key={sp} value={sp}>{sp}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="mt-8 flex justify-end">
                <button
                    className="btn btn-submit"
                    onClick={onNext}
                    disabled={!isFormValid}
                >
                    Next: Add Items ➔
                </button>
            </div>
        </div>
    );
}
