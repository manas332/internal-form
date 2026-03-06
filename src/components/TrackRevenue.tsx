'use client';

import { useState, useEffect } from 'react';

interface InvoiceItem {
    item_id?: string;
    name?: string;
    description?: string;
    quantity?: number;
    rate?: number;
    item_total?: number;
    tax_percentage?: number;
    hsn_or_sac?: string;
    carat_size?: string;
}

interface OrderData {
    _id: string;
    orderId: string;
    zohoInvoiceId: string;
    customerDetails?: {
        customer_name?: string;
        email?: string;
        phone?: string;
        city?: string;
        state?: string;
    };
    invoiceItems?: InvoiceItem[];
    salespersonName?: string;
    paymentMode?: string;
    status?: string;
    createdAt?: string;
}

interface SalespersonRevenue {
    salespersonName: string;
    totalRevenue: number;
    orderCount: number;
    orders: OrderData[];
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function getStatusLabel(status?: string): string {
    switch (status) {
        case 'PENDING_SHIPPING': return 'Pending';
        case 'PARTIALLY_SHIPPED': return 'Partial';
        case 'SHIPPED': return 'Shipped';
        case 'SELF_SHIPPED': return 'Self-Shipped';
        default: return status || '—';
    }
}

function getStatusClass(status?: string): string {
    switch (status) {
        case 'SHIPPED':
        case 'SELF_SHIPPED':
            return 'rev-status--shipped';
        case 'PARTIALLY_SHIPPED':
            return 'rev-status--partial';
        case 'PENDING_SHIPPING':
            return 'rev-status--pending';
        default:
            return '';
    }
}

const RANK_EMOJIS = ['🥇', '🥈', '🥉', '4️⃣'];

export default function TrackRevenue() {
    const [data, setData] = useState<SalespersonRevenue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedPerson, setExpandedPerson] = useState<string | null>(null);

    useEffect(() => {
        fetchRevenue();
    }, []);

    async function fetchRevenue() {
        try {
            setLoading(true);
            setError('');
            const res = await fetch('/api/orders/revenue');
            const json = await res.json();
            if (json.success) {
                setData(json.data);
            } else {
                setError(json.error || 'Failed to load revenue data');
            }
        } catch {
            setError('Network error – could not fetch revenue data');
        } finally {
            setLoading(false);
        }
    }

    const maxRevenue = data.length > 0 ? data[0].totalRevenue : 1;
    const totalAllRevenue = data.reduce((s, d) => s + d.totalRevenue, 0);
    const totalAllOrders = data.reduce((s, d) => s + d.orderCount, 0);

    function toggleExpand(name: string) {
        setExpandedPerson(prev => (prev === name ? null : name));
    }

    function getOrderTotal(order: OrderData): number {
        if (!order.invoiceItems) return 0;
        return order.invoiceItems.reduce((s, i) => s + (i.item_total || 0), 0);
    }

    return (
        <div className="max-w-4xl mx-auto w-full">
            {/* Header */}
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-indigo-600 dark:from-white dark:to-indigo-400 bg-clip-text text-transparent mb-2">
                    💰 Track Revenue
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Revenue breakdown by salesperson — sorted highest to lowest
                </p>
            </div>

            {/* Summary Cards */}
            {!loading && !error && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 flex flex-col items-center justify-center shadow-sm">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Revenue</span>
                        <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatCurrency(totalAllRevenue)}</span>
                    </div>
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 flex flex-col items-center justify-center shadow-sm">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Total Orders</span>
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">{totalAllOrders}</span>
                    </div>
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 flex flex-col items-center justify-center shadow-sm">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Salespersons</span>
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">{data.length}</span>
                    </div>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex flex-col gap-4">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className="h-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden relative animate-pulse" />
                    ))}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-4 rounded-xl mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span>⚠️</span>
                        <span>{error}</span>
                    </div>
                    <button className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition" onClick={fetchRevenue}>
                        Retry
                    </button>
                </div>
            )}

            {/* Revenue Cards */}
            {!loading && !error && data.map((sp, idx) => {
                const isExpanded = expandedPerson === sp.salespersonName;
                const barWidth = maxRevenue > 0 ? (sp.totalRevenue / maxRevenue) * 100 : 0;

                return (
                    <div key={sp.salespersonName} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl mb-4 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-all overflow-hidden">
                        {/* Clickable Header */}
                        <button
                            className="w-full flex items-center p-5 text-left bg-transparent border-none cursor-pointer gap-4 focus:outline-none"
                            onClick={() => toggleExpand(sp.salespersonName)}
                        >
                            <div className="text-2xl w-10 text-center font-bold text-gray-400">
                                {RANK_EMOJIS[idx] || `#${idx + 1}`}
                            </div>
                            <div className="flex-1">
                                <div className="text-lg font-bold text-gray-900 dark:text-white mb-0.5">{sp.salespersonName}</div>
                                <div className="text-sm text-gray-500">{sp.orderCount} order{sp.orderCount !== 1 ? 's' : ''}</div>
                            </div>
                            <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mr-4">
                                {formatCurrency(sp.totalRevenue)}
                            </div>
                            <div className={`text-xl text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''}`}>
                                ▾
                            </div>
                        </button>

                        {/* Revenue Bar */}
                        <div className="h-1.5 bg-gray-100 dark:bg-gray-900 w-full relative">
                            <div
                                className="absolute top-0 left-0 h-full bg-indigo-500 rounded-r-md transition-all duration-1000 ease-out"
                                style={{ width: `${barWidth}%` }}
                            />
                        </div>

                        {/* Expanded Orders */}
                        {isExpanded && (
                            <div className="border-t border-gray-200 dark:border-gray-700 p-5 bg-gray-50 dark:bg-gray-900/50 flex flex-col gap-4">
                                {sp.orders.length === 0 && (
                                    <div className="text-center py-8 text-gray-500 italic">No orders found for this salesperson.</div>
                                )}
                                {sp.orders.map((order) => (
                                    <div key={order._id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4 pb-4 border-b border-dashed border-gray-200 dark:border-gray-700">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order</span>
                                                <span className="font-mono text-base font-semibold text-gray-900 dark:text-white">{order.orderId}</span>
                                            </div>
                                            <div className="flex flex-row flex-wrap items-center gap-3">
                                                {order.customerDetails?.customer_name && (
                                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                                                        👤 {order.customerDetails.customer_name}
                                                    </span>
                                                )}
                                                <span className="text-sm text-gray-500">📅 {formatDate(order.createdAt)}</span>
                                                {order.paymentMode && (
                                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide ${order.paymentMode === 'COD'
                                                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                        }`}>
                                                        {order.paymentMode}
                                                    </span>
                                                )}
                                                {order.status && (
                                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide ${order.status === 'SHIPPED' || order.status === 'SELF_SHIPPED'
                                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                            : order.status === 'PARTIALLY_SHIPPED'
                                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                                        }`}>
                                                        {getStatusLabel(order.status)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Line Items Table */}
                                        {order.invoiceItems && order.invoiceItems.length > 0 && (
                                            <div className="overflow-x-auto mb-4 border border-gray-100 dark:border-gray-700/50 rounded-lg">
                                                <table className="w-full text-sm text-left">
                                                    <thead className="bg-gray-50 dark:bg-gray-800/80 text-gray-600 dark:text-gray-400 text-xs uppercase font-semibold">
                                                        <tr>
                                                            <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">Item</th>
                                                            <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">Qty</th>
                                                            <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">Rate</th>
                                                            <th className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 text-right">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                                        {order.invoiceItems.map((item, iIdx) => (
                                                            <tr key={iIdx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                                                                <td className="px-4 py-3">
                                                                    <div className="font-medium text-gray-900 dark:text-gray-200">{item.name || '—'}</div>
                                                                    {item.description && (
                                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.description}</div>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{item.quantity ?? '—'}</td>
                                                                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{item.rate != null ? formatCurrency(item.rate) : '—'}</td>
                                                                <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">{item.item_total != null ? formatCurrency(item.item_total) : '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}

                                        <div className="flex justify-between items-center p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/30">
                                            <span className="font-semibold text-indigo-900 dark:text-indigo-200">Order Total</span>
                                            <span className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(getOrderTotal(order))}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
