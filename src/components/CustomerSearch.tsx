'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Customer, GSTTreatment } from '@/types/invoice';
import { INDIAN_STATES, INDIAN_STATE_NAMES } from '@/types/invoice';
import stateCodesData from '@/data/state-codes.json';

interface CustomerSearchProps {
    onSelect: (customer: Customer) => void;
    selectedCustomer: Customer | null;
    onClear: () => void;
}

interface NewCustomerForm {
    display_name: string;
    email: string;
    company_name: string;
    gst_no: string;
    gst_treatment: GSTTreatment;
    place_of_contact: string;
    phone: string;
    address: string;
    pincode: string;
    city: string;
    state: string;
}

export default function CustomerSearch({
    onSelect,
    selectedCustomer,
    onClear,
}: CustomerSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [showNewForm, setShowNewForm] = useState(false);
    const [searchedButNoneSelected, setSearchedButNoneSelected] = useState(false);
    const [newCustomer, setNewCustomer] = useState<NewCustomerForm>({
        display_name: '',
        email: '',
        company_name: '',
        gst_no: '',
        gst_treatment: 'business_gst' as GSTTreatment,
        place_of_contact: '',
        phone: '',
        address: '',
        pincode: '',
        city: '',
        state: '',
    });
    const [creating, setCreating] = useState(false);
    const [checkingPincode, setCheckingPincode] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Debounced search
    const searchCustomers = useCallback(async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(
                `/api/customers?q=${encodeURIComponent(searchQuery)}`
            );
            const data = await res.json();
            setResults(data.customers || []);
            setShowDropdown(true);
        } catch (err) {
            console.error('Customer search failed:', err);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current);

        if (query.length >= 2) {
            timerRef.current = setTimeout(() => searchCustomers(query), 350);
        } else {
            setResults([]);
            setShowDropdown(false);
        }

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [query, searchCustomers]);

    // Close dropdown on outside click — mark as "typed but not selected"
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            ) {
                setShowDropdown(false);
                // If user clicked away with text in the box but no customer selected, show warning
                if (query.length >= 2) {
                    setSearchedButNoneSelected(true);
                }
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [query]);

    const handleSelect = (customer: Customer) => {
        onSelect(customer);
        setShowDropdown(false);
        setQuery('');
        setSearchedButNoneSelected(false);
    };

    // Auto-fetch city & state from pincode for new customer form
    const checkNewCustomerPincode = async (pin: string) => {
        if (!pin || pin.length !== 6) return;
        setCheckingPincode(true);
        try {
            const res = await fetch(`/api/delhivery/pincode?code=${pin}`);
            const data = await res.json();
            if (data.delivery_codes && data.delivery_codes.length > 0) {
                const deliveryCenter = data.delivery_codes[0].postal_code;
                const delhiveryStateCode = deliveryCenter.state_code || '';
                const delhiveryStateName = deliveryCenter.state || '';
                const delhiveryCity = deliveryCenter.district || deliveryCenter.city || deliveryCenter.center || '';

                let mappedStateName = '';
                if (delhiveryStateCode && INDIAN_STATE_NAMES[delhiveryStateCode]) {
                    mappedStateName = INDIAN_STATE_NAMES[delhiveryStateCode];
                } else if (delhiveryStateName) {
                    const match = stateCodesData.find(
                        (s) => s.name.toLowerCase() === delhiveryStateName.toLowerCase()
                    );
                    if (match) mappedStateName = match.name;
                }

                const resolvedState = mappedStateName || delhiveryStateName;
                setNewCustomer((prev) => ({
                    ...prev,
                    city: delhiveryCity,
                    state: resolvedState,
                    // Sync place_of_contact (state code) from delhivery
                    place_of_contact: delhiveryStateCode || prev.place_of_contact,
                }));
            }
        } catch (err) {
            console.error('Pincode lookup failed for new customer:', err);
        } finally {
            setCheckingPincode(false);
        }
    };

    const handleCreateCustomer = async () => {
        if (!newCustomer.display_name.trim()) return;

        setCreating(true);
        try {
            const billingAddress = newCustomer.address || newCustomer.city || newCustomer.pincode
                ? {
                    address: newCustomer.address,
                    city: newCustomer.city,
                    state: newCustomer.state,
                    zip: newCustomer.pincode,
                    country: 'India',
                }
                : undefined;

            const body: Record<string, unknown> = {
                display_name: newCustomer.display_name,
            };
            if (newCustomer.email) body.email = newCustomer.email;
            if (newCustomer.company_name) body.company_name = newCustomer.company_name;
            if (newCustomer.gst_no) body.gst_no = newCustomer.gst_no;
            if (newCustomer.gst_treatment) body.gst_treatment = newCustomer.gst_treatment;
            if (newCustomer.place_of_contact) body.place_of_contact = newCustomer.place_of_contact;
            if (newCustomer.phone) body.phone = `+91${newCustomer.phone}`;
            if (billingAddress) body.billing_address = billingAddress;

            const res = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();

            if (data.customer) {
                // Attach prefilled address/phone so CustomerStep can skip the Zoho re-fetch
                const createdWithPrefill = {
                    customer_id: data.customer.customer_id,
                    display_name: data.customer.display_name,
                    email: data.customer.email,
                    company_name: data.customer.company_name,
                    gst_no: data.customer.gst_no,
                    gst_treatment: data.customer.gst_treatment,
                    place_of_contact: data.customer.place_of_contact,
                    _prefilled: {
                        address: newCustomer.address,
                        pincode: newCustomer.pincode,
                        city: newCustomer.city,
                        state: newCustomer.state,
                        phone: newCustomer.phone,
                    },
                } as Customer & { _prefilled?: { address: string; pincode: string; city: string; state: string; phone: string } };
                onSelect(createdWithPrefill);
                setShowNewForm(false);
                setNewCustomer({
                    display_name: '',
                    email: '',
                    company_name: '',
                    gst_no: '',
                    gst_treatment: 'business_gst',
                    place_of_contact: '',
                    phone: '',
                    address: '',
                    pincode: '',
                    city: '',
                    state: '',
                });
            } else {
                alert(data.message || 'Failed to create customer');
            }
        } catch (err) {
            console.error('Create customer failed:', err);
            alert('Failed to create customer');
        } finally {
            setCreating(false);
        }
    };

    // If a customer is already selected, show badge
    if (selectedCustomer) {
        return (
            <div className="customer-selected">
                <div className="customer-badge">
                    <div className="customer-badge-info">
                        <span className="customer-badge-name">
                            {selectedCustomer.display_name}
                        </span>
                        {selectedCustomer.email && (
                            <span className="customer-badge-email">
                                {selectedCustomer.email}
                            </span>
                        )}
                        {selectedCustomer.gst_no && (
                            <span className="customer-badge-gst">
                                GST: {selectedCustomer.gst_no}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        className="customer-badge-clear"
                        onClick={onClear}
                        title="Change customer"
                    >
                        ✕
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="customer-search" ref={dropdownRef}>
            <div className="customer-search-input-wrapper">
                <input
                    type="text"
                    placeholder="Search customer by name..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setSearchedButNoneSelected(false); // reset warning while typing
                    }}
                    onFocus={() => {
                        setSearchedButNoneSelected(false);
                        if (query.length >= 2) setShowDropdown(true);
                    }}
                    className="form-input"
                    style={searchedButNoneSelected && query.length >= 2 ? { borderColor: '#ef4444', boxShadow: '0 0 0 2px rgba(239,68,68,0.2)' } : {}}
                    autoComplete="off"
                />
                {loading && <span className="search-spinner">⟳</span>}
            </div>

            {/* Inline warning: typed text but didn't select */}
            {searchedButNoneSelected && query.length >= 2 && !showDropdown && (
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: '#ef4444', fontSize: '13px' }}>
                        ✕ &quot;{query}&quot; is not a valid Zoho customer. Select from the dropdown or{' '}
                    </span>
                    <button
                        type="button"
                        style={{ color: '#ef4444', fontSize: '13px', fontWeight: 600, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        onClick={() => {
                            setShowNewForm(true);
                            setSearchedButNoneSelected(false);
                            setNewCustomer((prev) => ({ ...prev, display_name: query }));
                        }}
                    >
                        create new customer
                    </button>
                    <span style={{ color: '#ef4444', fontSize: '13px' }}>.</span>
                </div>
            )}

            {showDropdown && (
                <div className="customer-dropdown">
                    {results.length > 0 ? (
                        results.map((c) => (
                            <button
                                key={c.customer_id}
                                type="button"
                                className="customer-dropdown-item"
                                onClick={() => handleSelect(c)}
                            >
                                <span className="dropdown-item-name">{c.display_name}</span>
                                {c.email && (
                                    <span className="dropdown-item-email">{c.email}</span>
                                )}
                            </button>
                        ))
                    ) : (
                        <div className="customer-dropdown-empty">
                            No customers found for &quot;{query}&quot;
                        </div>
                    )}
                    <button
                        type="button"
                        className="customer-dropdown-create"
                        onClick={() => {
                            setShowNewForm(true);
                            setShowDropdown(false);
                            setNewCustomer((prev) => ({
                                ...prev,
                                display_name: query,
                            }));
                        }}
                    >
                        + Create New Customer
                    </button>
                </div>
            )}

            {!showDropdown && !showNewForm && (
                <button
                    type="button"
                    className="btn-link"
                    onClick={() => setShowNewForm(true)}
                >
                    + Create New Customer
                </button>
            )}

            {showNewForm && (
                <div className="new-customer-form">
                    <h4>New Customer</h4>

                    {/* ── Basic Info ── */}
                    <div className="form-grid-2">
                        <div className="form-group">
                            <label>Display Name *</label>
                            <input
                                type="text"
                                className="form-input"
                                value={newCustomer.display_name}
                                onChange={(e) =>
                                    setNewCustomer({ ...newCustomer, display_name: e.target.value })
                                }
                                placeholder="Customer or company name"
                            />
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input
                                type="email"
                                className="form-input"
                                value={newCustomer.email}
                                onChange={(e) =>
                                    setNewCustomer({ ...newCustomer, email: e.target.value })
                                }
                                placeholder="email@example.com"
                            />
                        </div>
                        <div className="form-group">
                            <label>Company Name</label>
                            <input
                                type="text"
                                className="form-input"
                                value={newCustomer.company_name}
                                onChange={(e) =>
                                    setNewCustomer({
                                        ...newCustomer,
                                        company_name: e.target.value,
                                    })
                                }
                            />
                        </div>
                        <div className="form-group">
                            <label>Phone</label>
                            <div className="flex gap-2 items-center">
                                <span
                                    className="form-input"
                                    style={{ width: '64px', textAlign: 'center', flexShrink: 0 }}
                                >
                                    +91
                                </span>
                                <input
                                    type="text"
                                    className="form-input flex-1"
                                    value={newCustomer.phone}
                                    onChange={(e) =>
                                        setNewCustomer({
                                            ...newCustomer,
                                            phone: e.target.value.replace(/\D/g, ''),
                                        })
                                    }
                                    placeholder="9876543210"
                                    maxLength={10}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Address ── */}
                    <div style={{ marginTop: '12px' }}>
                        <p className="text-xs text-gray-400 mb-2" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                            Billing Address
                        </p>
                        <div className="form-grid-2">
                            <div className="form-group relative" style={{ gridColumn: '1 / -1' }}>
                                <label>Address</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newCustomer.address}
                                    onChange={(e) =>
                                        setNewCustomer({ ...newCustomer, address: e.target.value })
                                    }
                                    placeholder="House / flat / street"
                                />
                            </div>
                            <div className="form-group relative">
                                <label>Pincode</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newCustomer.pincode}
                                    onChange={(e) =>
                                        setNewCustomer({
                                            ...newCustomer,
                                            pincode: e.target.value.replace(/\D/g, ''),
                                        })
                                    }
                                    onBlur={(e) => checkNewCustomerPincode(e.target.value)}
                                    placeholder="110001"
                                    maxLength={6}
                                />
                                {checkingPincode && (
                                    <span className="absolute right-3 top-9 text-xs text-accent">
                                        Fetching...
                                    </span>
                                )}
                            </div>
                            <div className="form-group">
                                <label>City</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newCustomer.city}
                                    onChange={(e) =>
                                        setNewCustomer({ ...newCustomer, city: e.target.value })
                                    }
                                    placeholder="Auto-filled from pincode"
                                />
                            </div>
                            <div className="form-group">
                                <label>State</label>
                                <select
                                    className="form-input"
                                    value={newCustomer.place_of_contact}
                                    onChange={(e) =>
                                        setNewCustomer({
                                            ...newCustomer,
                                            place_of_contact: e.target.value,
                                            state: INDIAN_STATE_NAMES[e.target.value] || newCustomer.state,
                                        })
                                    }
                                >
                                    <option value="">Select State</option>
                                    {INDIAN_STATES.map((code) => (
                                        <option key={code} value={code}>
                                            {INDIAN_STATE_NAMES[code]} ({code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* ── GST ── */}
                    <div style={{ marginTop: '12px' }}>
                        <p className="text-xs text-gray-400 mb-2" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                            GST Details
                        </p>
                        <div className="form-grid-2">
                            <div className="form-group">
                                <label>GST Treatment</label>
                                <select
                                    className="form-input"
                                    value={newCustomer.gst_treatment}
                                    onChange={(e) =>
                                        setNewCustomer({
                                            ...newCustomer,
                                            gst_treatment: e.target.value as GSTTreatment,
                                        })
                                    }
                                >
                                    <option value="business_gst">Registered Business (GST)</option>
                                    <option value="business_none">
                                        Unregistered Business
                                    </option>
                                    <option value="consumer">Consumer</option>
                                    <option value="overseas">Overseas</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>GST Number</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newCustomer.gst_no}
                                    onChange={(e) =>
                                        setNewCustomer({ ...newCustomer, gst_no: e.target.value })
                                    }
                                    placeholder="22AAAAA0000A1Z5"
                                    maxLength={15}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="new-customer-actions">
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleCreateCustomer}
                            disabled={creating || !newCustomer.display_name.trim()}
                        >
                            {creating ? 'Creating...' : 'Create Customer'}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setShowNewForm(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
