'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import LineItemRow from '@/components/LineItemRow';
import { InvoiceItem, ZohoItem, ZohoTax } from '@/types/invoice';
import { isInterstateOrder, normalizeItemTaxForContext, validateTaxesForOrder } from '@/lib/tax';

const emptyItem = (): InvoiceItem => ({
    name: '',
    description: '',
    quantity: 1,
    price: 0,
    final_price: undefined,
    tax_id: 'NO_TAX',
    tax_amount: 0,
    item_total: 0,
    cost_price: 0,
});

/**
 * Map a raw DB invoice item into the frontend InvoiceItem shape.
 *
 * Key differences between DB schema and InvoiceItem:
 *   DB `rate`    → InvoiceItem `price`        (pre-tax unit rate)
 *   DB `item_id` → InvoiceItem `zoho_item_id` ("✓ In Zoho" badge)
 */
function mapDbItemToInvoiceItem(dbItem: any): InvoiceItem {
    const rate = dbItem.rate ?? 0;
    const taxPct = dbItem.tax_percentage ?? 0;
    const qty = dbItem.quantity ?? 1;

    return {
        ...dbItem,
        price: dbItem.price ?? rate,
        zoho_item_id: dbItem.zoho_item_id || dbItem.item_id || '',
        final_price: dbItem.final_price ?? Math.round(rate * (1 + taxPct / 100) * 100) / 100,
        cost_price: dbItem.cost_price ?? 0,
        tax_amount: dbItem.tax_amount ?? 0,
        item_total: dbItem.item_total ?? (rate * qty),
        tax_percentage: taxPct,
    };
}

export default function EditInvoicePage() {
    const [orderIdSearch, setOrderIdSearch] = useState('');
    const [loadingOrder, setLoadingOrder] = useState(false);
    const [order, setOrder] = useState<any>(null);

    const [zohoItems, setZohoItems] = useState<ZohoItem[]>([]);
    const [zohoTaxes, setZohoTaxes] = useState<ZohoTax[]>([]);

    // Edit state
    const [items, setItems] = useState<InvoiceItem[]>([]);
    const [saving, setSaving] = useState(false);
    const [downloadingInvoice, setDownloadingInvoice] = useState(false);
    // Track whether changes have been saved (to show download button)
    const [savedSuccessfully, setSavedSuccessfully] = useState(false);

    const isInterstate = order ? isInterstateOrder(order.customerDetails?.state) : true;

    // Load Zoho items and taxes once on mount
    useEffect(() => {
        async function loadZohoData() {
            try {
                const [itemsRes, taxesRes] = await Promise.all([
                    fetch('/api/zoho/items'),
                    fetch('/api/zoho/taxes'),
                ]);
                if (itemsRes.ok) setZohoItems(await itemsRes.json());
                if (taxesRes.ok) setZohoTaxes(await taxesRes.json());
            } catch (err) {
                console.error('Failed to load zoho data:', err);
                toast.error('Failed to load products/taxes catalog from Zoho');
            }
        }
        loadZohoData();
    }, []);

    const fetchOrder = async () => {
        const q = orderIdSearch.trim();
        if (!q) { toast.error('Please enter an Order ID'); return; }

        setLoadingOrder(true);
        setOrder(null);
        setItems([]);
        setSavedSuccessfully(false);

        try {
            const res = await fetch(`/api/orders/${q}`);
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to fetch order');

            setOrder(data.order);
            setItems((data.order.invoiceItems || []).map(mapDbItemToInvoiceItem));
            toast.success(`Order ${data.order.orderId} loaded successfully`);
        } catch (err: any) {
            toast.error(err.message || 'Error fetching order details');
        } finally {
            setLoadingOrder(false);
        }
    };

    // ── Recalculate from tax-inclusive final price ───────────────
    const recalcFromFinalPrice = (
        item: InvoiceItem,
        overrides: Partial<InvoiceItem>,
        taxes: ZohoTax[]
    ): Partial<InvoiceItem> => {
        const merged = { ...item, ...overrides };
        const qty = Number(merged.quantity) || 0;
        const finalPricePerUnit = Number(merged.final_price) || 0;
        const taxId = merged.tax_id ?? '';

        let preTaxRate = finalPricePerUnit;
        let totalTaxAmount = 0;

        if (taxId && taxId !== 'NO_TAX') {
            const foundTax = taxes.find(t => t.tax_id === taxId);
            if (foundTax && foundTax.tax_percentage > 0) {
                preTaxRate = Math.round((finalPricePerUnit / (1 + foundTax.tax_percentage / 100)) * 100) / 100;
                const lineTotal = preTaxRate * qty;
                totalTaxAmount = Math.round(lineTotal * (foundTax.tax_percentage / 100) * 100) / 100;
            }
        }

        return {
            ...overrides,
            price: preTaxRate,
            tax_amount: totalTaxAmount,
            item_total: preTaxRate * qty,
        };
    };

    const handleItemChange = (index: number, updates: Partial<InvoiceItem>) => {
        const newItems = [...items];
        const currentItem = newItems[index];
        const normalized = normalizeItemTaxForContext({
            item: currentItem,
            updates,
            taxes: zohoTaxes,
            isInterstate,
        });

        const mergedUpdates: Partial<InvoiceItem> = { ...updates, ...normalized };

        const needsRecalc =
            'final_price' in mergedUpdates ||
            'tax_id' in mergedUpdates ||
            'quantity' in mergedUpdates;

        let finalUpdates: Partial<InvoiceItem> = mergedUpdates;

        if (needsRecalc) {
            finalUpdates = recalcFromFinalPrice(currentItem, mergedUpdates, zohoTaxes);
        }

        // Keep tax_percentage in sync for backend
        if (updates.tax_id) {
            const taxObj = zohoTaxes.find(t => t.tax_id === (finalUpdates.tax_id || updates.tax_id));
            finalUpdates.tax_percentage = taxObj ? taxObj.tax_percentage : 0;
        }

        newItems[index] = { ...currentItem, ...finalUpdates };
        setItems(newItems);
        setSavedSuccessfully(false); // Mark as dirty
    };

    const addItem = () => { setItems([...items, emptyItem()]); setSavedSuccessfully(false); };
    const removeItem = (index: number) => { setItems(items.filter((_, i) => i !== index)); setSavedSuccessfully(false); };

    // ── Live totals ─────────────────────────────────────────────
    const subtotal = items.reduce((acc, item) => acc + (item.item_total || 0), 0);
    const totalTax = items.reduce((acc, item) => acc + (item.tax_amount || 0), 0);
    const grandTotal = subtotal + totalTax;

    // ── Save (Transactional Replacement) ────────────────────────
    const handleSave = async () => {
        if (!order) return;

        if (items.length === 0) { toast.error('At least one item is required'); return; }

        const taxIssues = validateTaxesForOrder(items, zohoTaxes, isInterstate);
        if (taxIssues.length) {
            taxIssues.forEach(i => toast.error(`Item ${i.index + 1}: ${i.message}`));
            return;
        }

        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (!it.name.trim()) { toast.error(`Item ${i + 1}: Name is required`); return; }
            if (it.cost_price === undefined || it.cost_price < 0) {
                toast.error(`Item ${i + 1}: Valid Cost Price is required`);
                return;
            }
        }

        setSaving(true);
        try {
            const res = await fetch(`/api/invoices/${order.orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invoice_items: items,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update invoice');

            toast.success('Invoice replaced & synced in Zoho!');
            setOrder(data.order);
            setItems((data.order.invoiceItems || []).map(mapDbItemToInvoiceItem));
            setSavedSuccessfully(true);
        } catch (err: any) {
            toast.error(err.message || 'Error saving invoice changes');
        } finally {
            setSaving(false);
        }
    };

    // ── Download Invoice PDF ────────────────────────────────────
    const handleDownloadInvoice = async () => {
        if (!order?.orderId) return;
        setDownloadingInvoice(true);
        try {
            const res = await fetch(`/api/invoices/${order.orderId}/pdf`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to download invoice');
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `invoice-${order.orderId}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            toast.error(err.message || 'Download failed');
        } finally {
            setDownloadingInvoice(false);
        }
    };

    return (
        <div className="app-container">
            <div className="invoice-form">
                <div className="form-header">
                    <h1>Edit Invoice Details</h1>
                    <p>Search and modify items, prices, and taxes for any existing order</p>
                </div>

                {/* Lookup Section */}
                <div className="form-section flex gap-3 items-end">
                    <div className="form-group flex-1">
                        <label>Order ID (INV-xxxxxx)</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="Enter Order ID (e.g. INV-000101)"
                            value={orderIdSearch}
                            onChange={(e) => setOrderIdSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchOrder()}
                        />
                    </div>
                    <button
                        className="btn btn-primary h-[42px] px-6"
                        onClick={fetchOrder}
                        disabled={loadingOrder}
                    >
                        {loadingOrder ? 'Searching...' : '🔍 Search'}
                    </button>
                </div>

                {order && (
                    <div className="animate-in fade-in duration-300">
                        {/* Order Metadata */}
                        <div className="form-section grid grid-cols-1 md:grid-cols-3 gap-6 bg-linear-to-br from-indigo-50/20 to-transparent dark:from-accent/5 dark:to-transparent">
                            <div>
                                <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-2">Customer Details</h4>
                                <p className="text-sm font-bold text-gray-900 dark:text-white">{order.customerDetails?.customer_name}</p>
                                <p className="text-xs text-gray-500">{order.customerDetails?.email || 'No email'}</p>
                                <p className="text-xs text-gray-500">{order.customerDetails?.phone || 'No phone'}</p>
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-2">Location & Tax</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">
                                    {order.customerDetails?.address}, {order.customerDetails?.city}, {order.customerDetails?.state} - {order.customerDetails?.pincode}
                                </p>
                                <p className="text-xs font-semibold mt-1">
                                    Tax Type: {isInterstate ? <span className="text-amber-500">Interstate (IGST)</span> : <span className="text-green-500">Intrastate (CGST/SGST)</span>}
                                </p>
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-2">Order Info</h4>
                                <p className="text-xs text-gray-700 dark:text-gray-300">Order ID: <strong className="text-gray-900 dark:text-white">{order.orderId}</strong></p>
                                <p className="text-xs text-gray-700 dark:text-gray-300">Zoho Invoice ID: <span className="font-mono text-gray-500">{order.zohoInvoiceId}</span></p>
                                <p className="text-xs text-gray-700 dark:text-gray-300">Payment Mode: <strong className="text-gray-900 dark:text-white">{order.paymentMode}</strong></p>
                            </div>
                        </div>

                        {/* Items editing section */}
                        <div className="form-section">
                            <h3 className="section-title">
                                <span className="section-icon">📦</span> Edit Invoice Items
                            </h3>

                            <div className="line-items-container">
                                {items.map((item, index) => (
                                    <LineItemRow
                                        key={index}
                                        index={index}
                                        item={item}
                                        zohoItems={zohoItems}
                                        zohoTaxes={zohoTaxes}
                                        isInterstate={isInterstate}
                                        onChange={handleItemChange}
                                        onRemove={() => removeItem(index)}
                                        canRemove={items.length > 1}
                                    />
                                ))}

                                <button type="button" className="btn-add-item" onClick={addItem}>
                                    + Add another item
                                </button>
                            </div>

                            {/* Totals */}
                            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-[#2a2a38]">
                                <div className="totals-right ml-auto max-w-sm">
                                    <div className="total-row">
                                        <span>Subtotal (pre-tax)</span>
                                        <span>₹{subtotal.toFixed(2)}</span>
                                    </div>
                                    {totalTax > 0 && (
                                        <div className="total-row">
                                            <span>Total Tax</span>
                                            <span>₹{totalTax.toFixed(2)}</span>
                                        </div>
                                    )}
                                    <div className="total-row total-grand">
                                        <span>Invoice Total</span>
                                        <span>₹{grandTotal.toFixed(2)}</span>
                                    </div>

                                    <div className="form-submit-section mt-6 flex flex-col gap-3">
                                        <button
                                            className="btn btn-submit"
                                            onClick={handleSave}
                                            disabled={saving}
                                        >
                                            {saving ? (
                                                <><span className="btn-spinner border-2 border-white border-t-transparent rounded-full w-4 h-4 mr-2 inline-block"></span> Replacing Invoice in Zoho...</>
                                            ) : (
                                                'Save & Replace Invoice in Zoho'
                                            )}
                                        </button>

                                        {/* Download Invoice — always visible when order is loaded */}
                                        <button
                                            className="btn bg-white dark:bg-[#1c1c28] hover:bg-gray-50 dark:hover:bg-[#2a2a38] text-gray-800 dark:text-white py-3 px-5 rounded-xl flex items-center justify-center gap-2 transition-all border border-gray-200 dark:border-[#3a3a4a] shadow-sm hover:shadow font-medium w-full"
                                            onClick={handleDownloadInvoice}
                                            disabled={downloadingInvoice}
                                        >
                                            {downloadingInvoice ? (
                                                <><span className="btn-spinner border-2 border-accent border-t-transparent w-4 h-4 rounded-full"></span> Downloading...</>
                                            ) : (
                                                <>📄 Download Invoice PDF</>
                                            )}
                                        </button>

                                        {savedSuccessfully && (
                                            <p className="text-center text-sm text-green-500 font-medium animate-in fade-in duration-300">
                                                ✅ Invoice replaced successfully. Download the updated PDF above.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
