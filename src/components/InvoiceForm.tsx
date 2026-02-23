'use client';

import { useState } from 'react';
import type {
    Customer,
    InvoiceItem,
    GSTTreatment,
    CreateInvoiceResponse,
} from '@/types/invoice';
import {
    INDIAN_STATES,
    INDIAN_STATE_NAMES,
    SALESPERSONS,
} from '@/types/invoice';
import CustomerSearch from './CustomerSearch';
import LineItemRow from './LineItemRow';
import SuccessModal from './SuccessModal';

const emptyItem = (): InvoiceItem => ({
    name: '',
    description: '',
    quantity: 1,
    price: 0,
    hsn_or_sac: '',
});

const todayISO = () => new Date().toISOString().split('T')[0];

export default function InvoiceForm() {
    // --- State ---
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
        null
    );
    const [date, setDate] = useState(todayISO());
    const [dueDate, setDueDate] = useState('');
    const [paymentTerms, setPaymentTerms] = useState('');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [gstTreatment, setGstTreatment] =
        useState<GSTTreatment>('business_gst');
    const [gstNo, setGstNo] = useState('');
    const [placeOfSupply, setPlaceOfSupply] = useState('');
    const [salesperson, setSalesperson] = useState('');
    const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);
    const [notes, setNotes] = useState('');
    const [terms, setTerms] = useState('');
    const [shippingCharge, setShippingCharge] = useState('');
    const [adjustment, setAdjustment] = useState('');
    const [adjustmentDescription, setAdjustmentDescription] = useState('');

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successData, setSuccessData] = useState<{
        invoiceId: string;
        invoiceNumber: string;
        total: number;
        customerName: string;
        currencySymbol: string;
    } | null>(null);

    // --- Computed totals ---
    const subtotal = items.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0),
        0
    );
    const shippingAmount = Number(shippingCharge) || 0;
    const adjustmentAmount = Number(adjustment) || 0;
    const grandTotal = subtotal + shippingAmount + adjustmentAmount;

    // --- Item handlers ---
    const handleItemChange = (
        index: number,
        updates: Partial<InvoiceItem>
    ) => {
        setItems(items.map((item, i) =>
            i === index ? { ...item, ...updates } : item
        ));
    };

    const addItem = () => setItems([...items, emptyItem()]);

    const removeItem = (index: number) => {
        if (items.length <= 1) return;
        setItems(items.filter((_, i) => i !== index));
    };

    // --- Customer select ---
    const handleCustomerSelect = (customer: Customer) => {
        setSelectedCustomer(customer);
        if (customer.gst_no) setGstNo(customer.gst_no);
        if (customer.gst_treatment) setGstTreatment(customer.gst_treatment);
        if (customer.place_of_contact) setPlaceOfSupply(customer.place_of_contact);
    };

    // --- Submit ---
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!selectedCustomer) {
            setError('Please select or create a customer.');
            return;
        }

        const validItems = items.filter(
            (item) => item.name.trim() && Number(item.price) > 0
        );
        if (validItems.length === 0) {
            setError('Please add at least one item with a name and price.');
            return;
        }

        setSubmitting(true);

        try {
            const payload: Record<string, unknown> = {
                customer_id: selectedCustomer.customer_id,
                date,
                invoice_items: validItems.map((item) => ({
                    name: item.name,
                    description: item.description || undefined,
                    quantity: Number(item.quantity) || 1,
                    price: Number(item.price),
                    hsn_or_sac: item.hsn_or_sac || undefined,
                })),
            };

            if (dueDate) payload.due_date = dueDate;
            if (paymentTerms) payload.payment_terms = Number(paymentTerms);
            if (referenceNumber) payload.reference_number = referenceNumber;
            if (gstTreatment) payload.gst_treatment = gstTreatment;
            if (gstNo) payload.gst_no = gstNo;
            if (placeOfSupply) payload.place_of_supply = placeOfSupply;
            if (salesperson) payload.salesperson_name = salesperson;
            if (notes) payload.notes = notes;
            if (terms) payload.terms = terms;
            if (shippingCharge) payload.shipping_charge = shippingCharge;
            if (adjustment) {
                payload.adjustment = Number(adjustment);
                if (adjustmentDescription)
                    payload.adjustment_description = adjustmentDescription;
            }

            const res = await fetch('/api/invoices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data: CreateInvoiceResponse = await res.json();

            if (data.code === 0 && data.invoice) {
                setSuccessData({
                    invoiceId: data.invoice.invoice_id,
                    invoiceNumber: data.invoice.invoice_number,
                    total: data.invoice.total,
                    customerName: data.invoice.customer_name,
                    currencySymbol: data.invoice.currency_symbol || '₹',
                });
            } else {
                setError(data.message || 'Failed to create invoice. Please try again.');
            }
        } catch (err) {
            console.error('Invoice submission error:', err);
            setError('Network error. Please check your connection and try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // --- Reset for new invoice ---
    const resetForm = () => {
        setSelectedCustomer(null);
        setDate(todayISO());
        setDueDate('');
        setPaymentTerms('');
        setReferenceNumber('');
        setGstTreatment('business_gst');
        setGstNo('');
        setPlaceOfSupply('');
        setSalesperson('');
        setItems([emptyItem()]);
        setNotes('');
        setTerms('');
        setShippingCharge('');
        setAdjustment('');
        setAdjustmentDescription('');
        setError('');
        setSuccessData(null);
    };

    return (
        <>
            <form className="invoice-form" onSubmit={handleSubmit}>
                {/* Header */}
                <div className="form-header">
                    <h1>Create Invoice</h1>
                    <p>Generate a new invoice via Zoho Billing</p>
                </div>

                {/* Error */}
                {error && (
                    <div className="form-error">
                        <span>⚠</span> {error}
                    </div>
                )}

                {/* ============ SECTION: Customer ============ */}
                <section className="form-section">
                    <h2 className="section-title">
                        <span className="section-icon">👤</span> Customer
                    </h2>
                    <CustomerSearch
                        onSelect={handleCustomerSelect}
                        selectedCustomer={selectedCustomer}
                        onClear={() => {
                            setSelectedCustomer(null);
                            setGstNo('');
                            setPlaceOfSupply('');
                        }}
                    />
                </section>

                {/* ============ SECTION: Invoice Details ============ */}
                <section className="form-section">
                    <h2 className="section-title">
                        <span className="section-icon">📋</span> Invoice Details
                    </h2>
                    <div className="form-grid-3">
                        <div className="form-group">
                            <label>Invoice Date *</label>
                            <input
                                type="date"
                                className="form-input"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Due Date</label>
                            <input
                                type="date"
                                className="form-input"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>Payment Terms (days)</label>
                            <input
                                type="number"
                                className="form-input"
                                placeholder="e.g. 15, 30, 60"
                                value={paymentTerms}
                                onChange={(e) => setPaymentTerms(e.target.value)}
                                min="0"
                            />
                        </div>
                        <div className="form-group">
                            <label>Reference Number</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="PO# or reference"
                                value={referenceNumber}
                                onChange={(e) => setReferenceNumber(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>Salesperson</label>
                            <select
                                className="form-input"
                                value={salesperson}
                                onChange={(e) => setSalesperson(e.target.value)}
                            >
                                <option value="">Select Salesperson</option>
                                {SALESPERSONS.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                {/* ============ SECTION: GST Details ============ */}
                <section className="form-section">
                    <h2 className="section-title">
                        <span className="section-icon">🏛️</span> GST Details
                    </h2>
                    <div className="form-grid-3">
                        <div className="form-group">
                            <label>GST Treatment</label>
                            <select
                                className="form-input"
                                value={gstTreatment}
                                onChange={(e) =>
                                    setGstTreatment(e.target.value as GSTTreatment)
                                }
                            >
                                <option value="business_gst">Registered Business (GST)</option>
                                <option value="business_none">Unregistered Business</option>
                                <option value="consumer">Consumer</option>
                                <option value="overseas">Overseas</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>GST Number</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder="22AAAAA0000A1Z5"
                                value={gstNo}
                                onChange={(e) => setGstNo(e.target.value)}
                                maxLength={15}
                            />
                        </div>
                        <div className="form-group">
                            <label>Place of Supply</label>
                            <select
                                className="form-input"
                                value={placeOfSupply}
                                onChange={(e) => setPlaceOfSupply(e.target.value)}
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
                </section>

                {/* ============ SECTION: Line Items ============ */}
                <section className="form-section">
                    <h2 className="section-title">
                        <span className="section-icon">📦</span> Items
                    </h2>
                    <div className="line-items-container">
                        {items.map((item, index) => (
                            <LineItemRow
                                key={index}
                                item={item}
                                index={index}
                                onChange={handleItemChange}
                                onRemove={removeItem}
                                canRemove={items.length > 1}
                            />
                        ))}
                    </div>
                    <button type="button" className="btn btn-add-item" onClick={addItem}>
                        + Add Item
                    </button>
                </section>

                {/* ============ SECTION: Totals ============ */}
                <section className="form-section totals-section">
                    <div className="totals-grid">
                        <div className="totals-left">
                            <div className="form-group">
                                <label>Shipping Charge (₹)</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={shippingCharge}
                                    onChange={(e) => setShippingCharge(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Adjustment (₹)</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={adjustment}
                                    onChange={(e) => setAdjustment(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Adjustment Description</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="e.g. Rounding off"
                                    value={adjustmentDescription}
                                    onChange={(e) => setAdjustmentDescription(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="totals-right">
                            <div className="total-row">
                                <span>Subtotal</span>
                                <span>
                                    ₹{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            {shippingAmount > 0 && (
                                <div className="total-row">
                                    <span>Shipping</span>
                                    <span>
                                        ₹
                                        {shippingAmount.toLocaleString('en-IN', {
                                            minimumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                            )}
                            {adjustmentAmount !== 0 && (
                                <div className="total-row">
                                    <span>Adjustment</span>
                                    <span>
                                        ₹
                                        {adjustmentAmount.toLocaleString('en-IN', {
                                            minimumFractionDigits: 2,
                                        })}
                                    </span>
                                </div>
                            )}
                            <div className="total-row total-grand">
                                <span>Total</span>
                                <span>
                                    ₹
                                    {grandTotal.toLocaleString('en-IN', {
                                        minimumFractionDigits: 2,
                                    })}
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ============ SECTION: Notes & Terms ============ */}
                <section className="form-section">
                    <h2 className="section-title">
                        <span className="section-icon">📝</span> Notes & Terms
                    </h2>
                    <div className="form-grid-2">
                        <div className="form-group">
                            <label>Customer Notes</label>
                            <textarea
                                className="form-input form-textarea"
                                rows={3}
                                placeholder="Thank you for your business..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>Terms & Conditions</label>
                            <textarea
                                className="form-input form-textarea"
                                rows={3}
                                placeholder="Payment terms, return policy..."
                                value={terms}
                                onChange={(e) => setTerms(e.target.value)}
                            />
                        </div>
                    </div>
                </section>

                {/* ============ Submit ============ */}
                <div className="form-submit-section">
                    <button
                        type="submit"
                        className="btn btn-submit"
                        disabled={submitting}
                    >
                        {submitting ? (
                            <>
                                <span className="btn-spinner">⟳</span> Creating Invoice...
                            </>
                        ) : (
                            'Create Invoice'
                        )}
                    </button>
                </div>
            </form>

            {/* Success Modal */}
            {successData && (
                <SuccessModal
                    invoiceId={successData.invoiceId}
                    invoiceNumber={successData.invoiceNumber}
                    total={successData.total}
                    customerName={successData.customerName}
                    currencySymbol={successData.currencySymbol}
                    onClose={() => setSuccessData(null)}
                    onNewInvoice={resetForm}
                />
            )}
        </>
    );
}
