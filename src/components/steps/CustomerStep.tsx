'use client';

import { useState } from 'react';
import { CombinedFormData } from '@/types/wizard';
import { INDIAN_STATES, INDIAN_STATE_NAMES, SALESPERSONS, Customer } from '@/types/invoice';
import CustomerSearch from '../CustomerSearch'; // Reusing the existing component
import stateCodesData from '@/data/state-codes.json';
import { toast } from 'sonner';
import { customerStepSchema } from '@/lib/validation';

interface Props {
    formData: CombinedFormData;
    updateForm: (data: Partial<CombinedFormData>) => void;
    onNext: () => void;
}

export default function CustomerStep({ formData, updateForm, onNext }: Props) {
    const [checkingPincode, setCheckingPincode] = useState(false);

    const checkPincodeServiceability = async (pin: string) => {
        if (!pin || pin.length !== 6) return;

        setCheckingPincode(true);
        try {
            const res = await fetch(`/api/delhivery/pincode?code=${pin}`);
            const data = await res.json();

            if (data.delivery_codes && data.delivery_codes.length > 0) {
                const deliveryCenter = data.delivery_codes[0].postal_code;

                // Delhivery API returns state_code (e.g., "HR") and district/city
                const delhiveryStateCode = deliveryCenter.state_code || '';
                const delhiveryStateName = deliveryCenter.state || '';
                const delhiveryCity = deliveryCenter.district || deliveryCenter.city || deliveryCenter.center || '';

                let mappedStateName = '';

                // 1. Try mapping the 2-letter state_code directly using INDIAN_STATE_NAMES
                if (delhiveryStateCode && INDIAN_STATE_NAMES[delhiveryStateCode]) {
                    mappedStateName = INDIAN_STATE_NAMES[delhiveryStateCode];
                }
                // 2. Fallback to name-based lookup using stateCodesData
                else if (delhiveryStateName) {
                    const match = stateCodesData.find(
                        (s) => s.name.toLowerCase() === delhiveryStateName.toLowerCase()
                    );
                    if (match) {
                        mappedStateName = match.name;
                    }
                }

                updateForm({
                    isPincodeServiceable: true,
                    city: delhiveryCity,
                    state: mappedStateName || delhiveryStateName // fallback to raw string if found nothing
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

    const handlePincodeBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
        const pin = e.target.value;
        if (pin.length !== 6) return;
        await checkPincodeServiceability(pin);
    };

    const handleNext = () => {
        const result = customerStepSchema.safeParse(formData);
        if (!result.success) {
            // Show first error message
            toast.error(result.error.issues[0].message);
            return;
        }
        onNext();
    };

    return (
        <div className="form-section animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h3 className="section-title">
                <span className="section-icon">👤</span> Customer & Invoice Details
            </h3>

            <div className="mb-6">
                <label className="text-sm font-medium text-gray-400 mb-2 block">Search Existing Customer</label>
                <CustomerSearch
                    onSelect={async (customer) => {
                        const KNOWN_CODES = ['+91', '+1', '+44', '+971', '+61', '+65', '+60', '+49'];

                        let rawPhone = ((customer as Customer & { mobile?: string, phone?: string }).mobile)
                            || ((customer as Customer & { mobile?: string, phone?: string }).phone)
                            || '';

                        let parsedCountryCode = '+91'; // default India
                        let parsedPhone = '';

                        // Fetch full customer details to get billing_address
                        try {
                            const res = await fetch(`/api/customers/${customer.customer_id}`);
                            if (res.ok) {
                                const data = await res.json();
                                if (data.customer) {
                                    rawPhone = data.customer.mobile || data.customer.phone || rawPhone;

                                    const billing_address = data.customer.billing_address;
                                    if (billing_address) {
                                        updateForm({
                                            address: billing_address.street2 ? `${billing_address.address}\n${billing_address.street2}` : billing_address.address || '',
                                            pincode: billing_address.zip || '',
                                            city: billing_address.city || '',
                                            state: billing_address.state || '',
                                        });

                                        if (billing_address.zip && billing_address.zip.length === 6) {
                                            checkPincodeServiceability(billing_address.zip);
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            console.error('Failed to fetch full customer details:', error);
                        }

                        if (rawPhone) {
                            // Strip all non-digit chars except leading +
                            const cleaned = '+' === rawPhone[0]
                                ? '+' + rawPhone.slice(1).replace(/\D/g, '')
                                : rawPhone.replace(/\D/g, '');

                            if (cleaned.startsWith('+') && cleaned.length > 10) {
                                // Has country code prefix - try matching known codes greedily from longest
                                const sortedCodes = [...KNOWN_CODES].sort((a, b) => b.length - a.length);
                                let matched = false;
                                for (const code of sortedCodes) {
                                    if (cleaned.startsWith(code)) {
                                        const rest = cleaned.slice(code.length);
                                        if (rest.length === 10) {
                                            parsedCountryCode = code;
                                            parsedPhone = rest;
                                            matched = true;
                                            break;
                                        }
                                    }
                                }
                                if (!matched) {
                                    // Cannot match known code exactly — take last 10 as phone, keep +91
                                    parsedPhone = cleaned.slice(-10);
                                }
                            } else {
                                // No "+", just digits — assume +91, take last 10
                                const digitsOnly = cleaned.replace('+', '');
                                parsedPhone = digitsOnly.slice(-10);
                            }
                        }

                        updateForm({
                            customer_id: customer.customer_id,
                            customer_name: customer.display_name || '',
                            email: customer.email || '',
                            country_code: parsedCountryCode,
                            phone: parsedPhone,
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
                    <div className="flex gap-2 items-end">
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-400 mb-1">Code</span>
                            <select
                                className="form-input"
                                style={{ width: '110px' }}
                                value={formData.country_code}
                                onChange={(e) => updateForm({ country_code: e.target.value })}
                            >
                                <option value="+91">🇮🇳 +91 (India)</option>
                                <option value="+1">🇺🇸 +1 (USA)</option>
                                <option value="+44">🇬🇧 +44 (UK)</option>
                                <option value="+971">🇦🇪 +971 (UAE)</option>
                                <option value="+61">🇦🇺 +61 (AUS)</option>
                                <option value="+65">🇸🇬 +65 (SG)</option>
                                <option value="+60">🇲🇾 +60 (MY)</option>
                                <option value="+49">🇩🇪 +49 (DE)</option>
                            </select>
                        </div>
                        <div className="flex flex-col flex-1">
                            <span className="text-xs text-gray-400 mb-1">10-digit number</span>
                            <input
                                className="form-input"
                                value={formData.phone}
                                onChange={(e) => updateForm({ phone: e.target.value.replace(/\D/g, '') })}
                                placeholder="9876543210"
                                maxLength={10}
                            />
                        </div>
                    </div>
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
                    onClick={handleNext}
                >
                    Next: Add Items ➔
                </button>
            </div>
        </div>
    );
}
