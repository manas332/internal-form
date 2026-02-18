'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Customer, GSTTreatment } from '@/types/invoice';
import { INDIAN_STATES, INDIAN_STATE_NAMES } from '@/types/invoice';

interface CustomerSearchProps {
    onSelect: (customer: Customer) => void;
    selectedCustomer: Customer | null;
    onClear: () => void;
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
    const [newCustomer, setNewCustomer] = useState({
        display_name: '',
        email: '',
        company_name: '',
        gst_no: '',
        gst_treatment: 'business_gst' as GSTTreatment,
        place_of_contact: '',
    });
    const [creating, setCreating] = useState(false);
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

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            ) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleSelect = (customer: Customer) => {
        onSelect(customer);
        setShowDropdown(false);
        setQuery('');
    };

    const handleCreateCustomer = async () => {
        if (!newCustomer.display_name.trim()) return;

        setCreating(true);
        try {
            const res = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newCustomer),
            });

            const data = await res.json();

            if (data.customer) {
                const created: Customer = {
                    customer_id: data.customer.customer_id,
                    display_name: data.customer.display_name,
                    email: data.customer.email,
                    company_name: data.customer.company_name,
                    gst_no: data.customer.gst_no,
                    gst_treatment: data.customer.gst_treatment,
                };
                onSelect(created);
                setShowNewForm(false);
                setNewCustomer({
                    display_name: '',
                    email: '',
                    company_name: '',
                    gst_no: '',
                    gst_treatment: 'business_gst',
                    place_of_contact: '',
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
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => query.length >= 2 && setShowDropdown(true)}
                    className="form-input"
                    autoComplete="off"
                />
                {loading && <span className="search-spinner">⟳</span>}
            </div>

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
                        <div className="form-group">
                            <label>Place of Contact (State)</label>
                            <select
                                className="form-input"
                                value={newCustomer.place_of_contact}
                                onChange={(e) =>
                                    setNewCustomer({
                                        ...newCustomer,
                                        place_of_contact: e.target.value,
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
