'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrackingShipmentData } from '@/types/delhivery';

type DateFilterType = 'custom' | 'weekly' | 'monthly' | 'all';

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
    waybill?: string;
    shipments?: {
        waybill?: string;
    }[];
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

    const [dateFilter, setDateFilter] = useState<DateFilterType>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

    const [expandedTracking, setExpandedTracking] = useState<Set<string>>(new Set());
    const [trackingDataMap, setTrackingDataMap] = useState<Record<string, TrackingShipmentData[]>>({});
    const [trackingLoading, setTrackingLoading] = useState<Record<string, boolean>>({});
    const [trackingError, setTrackingError] = useState<Record<string, string>>({});

    const fetchRevenue = useCallback(async () => {
        try {
            setLoading(true);
            setError('');

            let url = '/api/orders/revenue';
            const params = new URLSearchParams();

            const today = new Date();
            today.setHours(23, 59, 59, 999);

            if (dateFilter === 'weekly') {
                const past = new Date(today);
                // Start of the current week (Sunday)
                past.setDate(today.getDate() - today.getDay());
                past.setHours(0, 0, 0, 0);
                params.append('startDate', past.toISOString());
                params.append('endDate', today.toISOString());
            } else if (dateFilter === 'monthly') {
                // Start of the current month
                const past = new Date(today.getFullYear(), today.getMonth(), 1);
                past.setHours(0, 0, 0, 0);
                params.append('startDate', past.toISOString());
                params.append('endDate', today.toISOString());
            } else if (dateFilter === 'custom') {
                if (startDate) params.append('startDate', new Date(startDate).toISOString());
                if (endDate) params.append('endDate', new Date(endDate).toISOString());
            }

            const queryString = params.toString();
            if (queryString) {
                url += `?${queryString}`;
            }

            const res = await fetch(url);
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
    }, [dateFilter, startDate, endDate]);

    useEffect(() => {
        fetchRevenue();
    }, [fetchRevenue]);

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

    function toggleOrderExpand(orderId: string, e: React.MouseEvent) {
        e.stopPropagation();
        setExpandedOrders(prev => {
            const next = new Set(prev);
            if (next.has(orderId)) {
                next.delete(orderId);
            } else {
                next.add(orderId);
            }
            return next;
        });
    }

    const fetchTrackingForOrder = async (order: OrderData) => {
        const orderSysId = order._id;
        setTrackingLoading(prev => ({ ...prev, [orderSysId]: true }));
        setTrackingError(prev => ({ ...prev, [orderSysId]: '' }));
        try {
            const waybills = new Set<string>();
            if (order.waybill) waybills.add(order.waybill);
            if (order.shipments && order.shipments.length > 0) {
                order.shipments.forEach(s => {
                    if (s.waybill) waybills.add(s.waybill);
                });
            }

            let endpoint = '';
            if (waybills.size > 0) {
                endpoint = `/api/delhivery/track?waybill=${Array.from(waybills).join(',')}`;
            } else {
                const baseId = order.orderId.trim();
                const refIdsQuery = `${baseId},${baseId}-pkg-1,${baseId}-pkg-2,${baseId}-pkg-3`;
                endpoint = `/api/delhivery/track?ref_ids=${refIdsQuery}`;
            }

            const res = await fetch(endpoint);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch tracking data');

            // Delhivery often returns 200 OK but with an Error message in the body
            if (data.Error) {
                if (typeof data.Error === 'string' && (data.Error.includes('No such waybill') || data.Error.includes('Not Found') || data.Error.includes('Order Id found'))) {
                    throw new Error('Shipment created, but not yet scanned by Delhivery.');
                }
                throw new Error(`Delhivery returned: ${data.Error}`);
            }

            if (data.ShipmentData && data.ShipmentData.length > 0) {
                setTrackingDataMap(prev => ({ ...prev, [orderSysId]: data.ShipmentData }));
            } else {
                throw new Error('No tracking info found for this order');
            }
        } catch (err) {
            setTrackingError(prev => ({ ...prev, [orderSysId]: err instanceof Error ? err.message : 'Unknown error' }));
        } finally {
            setTrackingLoading(prev => ({ ...prev, [orderSysId]: false }));
        }
    };

    function toggleTrackingExpand(order: OrderData, e: React.MouseEvent) {
        e.stopPropagation();
        const orderSysId = order._id;
        setExpandedTracking(prev => {
            const next = new Set(prev);
            if (next.has(orderSysId)) {
                next.delete(orderSysId);
            } else {
                next.add(orderSysId);
                if (!trackingDataMap[orderSysId] && !trackingLoading[orderSysId]) {
                    fetchTrackingForOrder(order);
                }
            }
            return next;
        });
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

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                    {['all', 'weekly', 'monthly', 'custom'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setDateFilter(f as DateFilterType)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${dateFilter === f
                                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                                }`}
                        >
                            {f === 'all' && 'All Time'}
                            {f === 'weekly' && 'This Week'}
                            {f === 'monthly' && 'This Month'}
                            {f === 'custom' && 'Custom Range'}
                        </button>
                    ))}
                </div>

                {dateFilter === 'custom' && (
                    <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0 flex-1"
                        />
                        <span className="text-gray-400 text-sm">to</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0 flex-1"
                        />
                    </div>
                )}
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
                                        <div
                                            className={`flex flex-col md:flex-row md:items-start justify-between gap-4 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg p-2 -m-2 ${expandedOrders.has(order._id) ? 'mb-4 pb-4 border-b border-dashed border-gray-200 dark:border-gray-700' : ''}`}
                                            onClick={(e) => toggleOrderExpand(order._id, e)}
                                        >
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-gray-400 text-xs transition-transform ${expandedOrders.has(order._id) ? 'rotate-90 text-indigo-500' : ''}`}>▶</span>
                                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Order</span>
                                                </div>
                                                <span className="font-mono text-base font-semibold text-gray-900 dark:text-white ml-5">{order.orderId}</span>
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

                                                {/* Track Button */}
                                                {(() => {
                                                    const isClickable = order.status === 'SHIPPED' || order.status === 'PARTIALLY_SHIPPED';
                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                if (isClickable) toggleTrackingExpand(order, e);
                                                            }}
                                                            disabled={!isClickable}
                                                            className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide border flex items-center gap-1 transition-all ${isClickable ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800/50 dark:hover:bg-indigo-900/50 cursor-pointer' : 'bg-gray-50 text-gray-400 border-gray-200 dark:bg-gray-800/50 dark:text-gray-500 dark:border-gray-700/50 cursor-not-allowed'}`}
                                                            title={!isClickable ? 'Tracking not available for un-shipped or self-shipped orders' : 'Track Order'}
                                                        >
                                                            📍 Track{expandedTracking.has(order._id) ? 'ing...' : ''}
                                                        </button>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {/* Tracking Contents (Collapsible) */}
                                        {expandedTracking.has(order._id) && (
                                            <div className="animate-fadeIn mt-2 mb-4 p-4 border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl relative">
                                                {trackingLoading[order._id] && <div className="text-sm text-indigo-600 dark:text-indigo-400 flex items-center gap-2"><span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></span> Fetching tracking details...</div>}
                                                {trackingError[order._id] && <div className="text-sm text-red-500 dark:text-red-400">⚠️ {trackingError[order._id]}</div>}

                                                {!trackingLoading[order._id] && trackingDataMap[order._id] && trackingDataMap[order._id]!.length > 0 && (() => {
                                                    const shipments = trackingDataMap[order._id]!;
                                                    return (
                                                        <div className="flex flex-col gap-6">
                                                            {shipments.map((trackingData, tIdx) => (
                                                                <div key={tIdx} className={tIdx > 0 ? "pt-4 border-t border-indigo-200 dark:border-indigo-800/50" : ""}>
                                                                    <div className="flex justify-between items-center border-b border-indigo-100 dark:border-indigo-900/50 pb-3 mb-4">
                                                                        <div>
                                                                            <h4 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                                                                {trackingData.Shipment.AWB}
                                                                                {shipments.length > 1 && <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 px-2 py-0.5 rounded-full font-medium shadow-sm">Box {tIdx + 1} of {shipments.length}</span>}
                                                                            </h4>
                                                                            <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Expected Delivery: <span className="font-medium text-gray-700 dark:text-gray-300">{trackingData.Shipment.ExpectedDeliveryDate ? new Date(trackingData.Shipment.ExpectedDeliveryDate).toLocaleDateString() : '—'}</span></p>
                                                                        </div>
                                                                        <div className="px-2.5 py-1 bg-white dark:bg-[#16161f] border border-indigo-100 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-400 rounded-md text-xs font-bold tracking-wider shadow-sm">
                                                                            {(trackingData.Shipment.CurrentStatus || trackingData.Shipment.Status)?.Status || 'UNKNOWN'}
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px before:h-full before:w-0.5 before:bg-indigo-200 dark:before:bg-indigo-900/50">
                                                                        {trackingData.Shipment.Scans?.map((scanItem: any, idx: number) => {
                                                                            const scan = 'ScanDetail' in scanItem ? scanItem.ScanDetail : scanItem;
                                                                            return (
                                                                                <div key={idx} className="relative flex items-start gap-4">
                                                                                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/80 border-2 border-white dark:border-gray-800 flex items-center justify-center z-10 shrink-0 mt-0.5">
                                                                                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                                                                    </div>
                                                                                    <div className="bg-white dark:bg-[#16161f] border border-gray-100 dark:border-[#2a2a38] p-3 rounded-lg w-full shadow-sm">
                                                                                        <div className="flex flex-col sm:flex-row justify-between mb-1 gap-1">
                                                                                            <span className="text-sm font-bold text-gray-900 dark:text-white">{scan.ScanType || scan.Scan || '-'}</span>
                                                                                            <span className="text-xs font-medium text-gray-500">{scan.ScanDateTime ? new Date(scan.ScanDateTime).toLocaleString() : '—'}</span>
                                                                                        </div>
                                                                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">{scan.Instructions || '-'}</p>
                                                                                        {scan.ScannedLocation && <p className="text-[11px] font-medium text-indigo-500 mt-2 flex items-center gap-1">📍 {scan.ScannedLocation}</p>}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}

                                        {/* Order Contents (Collapsible) */}
                                        {expandedOrders.has(order._id) && (
                                            <div className="animate-fadeIn mt-2 pl-2 border-l-2 border-indigo-100 dark:border-indigo-900/30">

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

                                                <div className="flex justify-between items-center p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/30 mt-4 text-sm md:text-base">
                                                    <span className="font-semibold text-indigo-900 dark:text-indigo-200">Order Total</span>
                                                    <span className="font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(getOrderTotal(order))}</span>
                                                </div>
                                            </div>
                                        )}
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
