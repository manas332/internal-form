'use client';

import { useState, useEffect } from 'react';
import { TrackingShipmentData } from '@/types/delhivery';
import Link from 'next/link';
import { DELHIIVERY_WAREHOUSES } from '@/config/warehouses';

interface StoredOrder {
    waybill: string;
    orderId: string;
    consignee: string;
    date: string;
}

interface DBWaybill {
    _id: string;
    waybill: string;
    status: string;
    orderId?: string | null;
    createdAt: string;
    isSelfShipped?: boolean;
    selfShipmentStatus?: string;
    selfShipmentNotes?: string;
    invoiceItems?: any[];
}

export default function TrackingDashboard() {
    const [recentOrders, setRecentOrders] = useState<StoredOrder[]>([]);
    const [dbOrders, setDbOrders] = useState<DBWaybill[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [trackingData, setTrackingData] = useState<TrackingShipmentData | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    const [warehouseFilter, setWarehouseFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedSelfShippedOrder, setSelectedSelfShippedOrder] = useState<DBWaybill | null>(null);
    const [updateSelfShipLoading, setUpdateSelfShipLoading] = useState(false);
    const [selfShipStatusInput, setSelfShipStatusInput] = useState('');
    const [selfShipNotesInput, setSelfShipNotesInput] = useState('');

    // 1. Initial Load: Fetch shipped orders containing waybills from DB
    useEffect(() => {
        // Load local orders
        try {
            const storedStr = localStorage.getItem('delhivery_recent_orders');
            if (storedStr) {
                setRecentOrders(JSON.parse(storedStr));
            }
        } catch (e) {
            console.error('Failed to load recent local orders', e);
        }

        fetchDbOrders();
    }, []);

    const fetchDbOrders = async (queryParam = '?limit=all') => {
        try {
            const separator = queryParam.includes('?') ? '&' : '?';
            const res = await fetch(`/api/orders/tracked${queryParam}${separator}warehouse=${warehouseFilter}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setDbOrders(data.waybills || []);
                }
            }
        } catch (err) {
            console.error('Failed to fetch tracked orders', err);
        }
    };

    const [dateFrom, setDateFrom] = useState('');

    const applyDateFilter = async () => {
        try {
            setLoading(true);

            // Read from DB using the fromDate filter natively if present
            const queryParams = dateFrom ? `?fromDate=${dateFrom}&limit=all` : `?limit=all`;
            await fetchDbOrders(queryParams);
        } catch (err) {
            console.error('Failed to filter by start date', err);
            setErrorMsg('Failed to fetch orders by dates.');
        } finally {
            setLoading(false);
        }
    };

    const fetchTracking = async (query: string) => {
        if (!query.trim()) return;
        setLoading(true);
        setErrorMsg('');
        setTrackingData(null);

        const localMatch = dbOrders.find(o => o.waybill === query.trim() || o.orderId === query.trim());
        if (localMatch && localMatch.isSelfShipped) {
            setLoading(false);
            setSelectedSelfShippedOrder(localMatch);
            setSelfShipStatusInput(localMatch.selfShipmentStatus || 'Order Created');
            setSelfShipNotesInput(localMatch.selfShipmentNotes || '');
            return;
        }
        setSelectedSelfShippedOrder(null);

        // Auto-detect if it's waybill (usually purely numeric and long) or ref_id (alphanumeric like INV-X)
        const isWaybill = /^\d{12,15}$/.test(query.trim());
        const paramStr = isWaybill ? `waybill=${query.trim()}` : `ref_ids=${query.trim()}`;

        try {
            const res = await fetch(`/api/delhivery/track?${paramStr}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to fetch tracking data');

            if (data.ShipmentData && data.ShipmentData.length > 0) {
                setTrackingData(data.ShipmentData[0]);
            } else {
                throw new Error('No tracking information found for this ID');
            }

        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const handleSearchClick = () => fetchTracking(searchQuery);

    const saveSelfShipment = async () => {
        if (!selectedSelfShippedOrder) return;
        setUpdateSelfShipLoading(true);
        setErrorMsg('');
        try {
            const res = await fetch(`/api/orders/${selectedSelfShippedOrder.orderId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selfShipmentStatus: selfShipStatusInput,
                    selfShipmentNotes: selfShipNotesInput
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update order');

            // update local state
            setSelectedSelfShippedOrder({
                ...selectedSelfShippedOrder,
                selfShipmentStatus: selfShipStatusInput,
                selfShipmentNotes: selfShipNotesInput
            });
            // Update in dbOrders list
            setDbOrders(prev => prev.map(o => o.orderId === selectedSelfShippedOrder.orderId ? {
                ...o, selfShipmentStatus: selfShipStatusInput, selfShipmentNotes: selfShipNotesInput
            } : o));

        } catch (err) {
            setErrorMsg(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setUpdateSelfShipLoading(false);
        }
    };

    const renderInvoiceItems = (items: any[]) => {
        if (!items || items.length === 0) return null;
        return (
            <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Order Items</h3>
                <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 dark:bg-[#1c1c28] text-gray-600 dark:text-gray-400 text-xs uppercase font-semibold">
                            <tr>
                                <th className="px-4 py-3 border-b border-gray-200 dark:border-[#2a2a38]">Item</th>
                                <th className="px-4 py-3 border-b border-gray-200 dark:border-[#2a2a38]">Qty</th>
                                <th className="px-4 py-3 border-b border-gray-200 dark:border-[#2a2a38]">Rate</th>
                                <th className="px-4 py-3 border-b border-gray-200 dark:border-[#2a2a38] text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a38]">
                            {items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-[#1c1c28]/50">
                                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-200">{item.name || item.item_id || '—'}</td>
                                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{item.quantity ?? '—'}</td>
                                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">₹{item.rate ?? 0}</td>
                                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">₹{item.item_total ?? 0}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const getStatusColor = (statusType: string) => {
        switch (statusType?.toUpperCase()) {
            case 'DELIVERED': return 'text-green-400 bg-green-400/10 border-green-500/20';
            case 'IN TRANSIT': return 'text-blue-400 bg-blue-400/10 border-blue-500/20';
            case 'RTO': return 'text-red-400 bg-red-400/10 border-red-500/20';
            case 'DISPATCHED': return 'text-yellow-400 bg-yellow-400/10 border-yellow-500/20';
            case 'PICKED UP': return 'text-cyan-400 bg-cyan-400/10 border-cyan-500/20';
            default: return 'text-gray-400 bg-gray-400/10 border-gray-500/20';
        }
    };

    return (
        <div className="max-w-4xl mx-auto py-8 px-4">
            <div className="text-center mb-10">
                <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-500 dark:from-white dark:to-gray-400 bg-clip-text text-transparent mb-2">
                    Track Shipments
                </h1>
                <p className="text-gray-500 dark:text-gray-400">Search by Waybill Number or Order ID, or view recent orders</p>
            </div>

            {/* Search Bar */}
            <div className="flex gap-3 mb-12 max-w-2xl mx-auto">
                <input
                    type="text"
                    className="form-input flex-1 p-3 text-lg bg-white dark:bg-[#16161f] text-gray-900 dark:text-white border-gray-300 dark:border-[#2a2a38] shadow-sm"
                    placeholder="e.g. 1122345678722 or INV-1002"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearchClick()}
                />
                <button
                    className="btn btn-primary px-8 text-lg flex items-center gap-2"
                    onClick={handleSearchClick}
                    disabled={loading || !searchQuery.trim()}
                >
                    {loading ? <span className="btn-spinner border-2 border-white border-t-transparent flex-shrink-0 w-5 h-5 rounded-full" /> : '🔍'}
                    Search
                </button>
            </div>

            {/* Date Filters */}
            {!trackingData && !selectedSelfShippedOrder && (
                <div className="max-w-xl mx-auto mb-10 p-4 bg-white dark:bg-[#12121a] border border-gray-200 dark:border-[#2a2a38] rounded-xl shadow-sm flex flex-col sm:flex-row flex-wrap gap-4 items-end justify-between">
                    <div className="flex-1 w-full sm:min-w-[150px]">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Select Start Date</label>
                        <input
                            type="date"
                            className="form-input w-full p-2 text-sm bg-gray-50 dark:bg-[#16161f] text-gray-900 dark:text-white border border-gray-300 dark:border-[#2a2a38] rounded-lg focus:ring-accent focus:border-accent transition-colors"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                        />
                    </div>
                    <div className="flex-1 w-full sm:min-w-[150px]">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Warehouse</label>
                        <select
                            className="form-input w-full p-2 text-sm bg-gray-50 dark:bg-[#16161f] text-gray-900 dark:text-white border border-gray-300 dark:border-[#2a2a38] rounded-lg focus:ring-accent focus:border-accent transition-colors"
                            value={warehouseFilter}
                            onChange={(e) => setWarehouseFilter(e.target.value)}
                        >
                            <option value="">All Warehouses</option>
                            {DELHIIVERY_WAREHOUSES.map((w: string) => (
                                <option key={w} value={w}>{w}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 w-full sm:min-w-[150px]">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Status</label>
                        <select
                            className="form-input w-full p-2 text-sm bg-gray-50 dark:bg-[#16161f] text-gray-900 dark:text-white border border-gray-300 dark:border-[#2a2a38] rounded-lg focus:ring-accent focus:border-accent transition-colors"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">All Statuses</option>
                            <option value="MANIFESTED">Manifested</option>
                            <option value="IN TRANSIT">In Transit</option>
                            <option value="PENDING">Pending</option>
                            <option value="DISPATCHED">Dispatched</option>
                            <option value="PICKED UP">Picked Up</option>
                            <option value="OUT FOR DELIVERY">Out for Delivery</option>
                            <option value="DELIVERED">Delivered</option>
                            <option value="RTO">RTO</option>
                            <option value="ORDER CREATED">Self: Order Created</option>
                            <option value="ORDER SHIPPED">Self: Order shipped</option>
                            <option value="ORDER COMPLETED">Self: Order Completed</option>
                        </select>
                    </div>
                    <button
                        onClick={applyDateFilter}
                        disabled={loading}
                        className="btn w-full sm:w-auto btn-primary py-2 px-6 whitespace-nowrap"
                    >
                        {loading ? 'Fetching...' : 'Fetch Orders'}
                    </button>
                </div>
            )}

            {errorMsg && (
                <div className="form-error max-w-2xl mx-auto mb-8">
                    {errorMsg}
                </div>
            )}

            {/* Back Button */}
            {(trackingData || selectedSelfShippedOrder) && (
                <button
                    onClick={() => {
                        setTrackingData(null);
                        setSelectedSelfShippedOrder(null);
                        setSearchQuery('');
                    }}
                    className="mb-4 flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-[#16161f] hover:text-accent dark:hover:text-accent hover:bg-gray-50 dark:hover:bg-[#1c1c28] border border-gray-200 dark:border-[#2a2a38] rounded-lg transition-all shadow-sm w-fit"
                >
                    ← Back to Orders
                </button>
            )}

            {/* Tracking Results Area */}
            {trackingData ? (
                <div className="bg-white dark:bg-[#12121a] border border-gray-200 dark:border-[#2a2a38] rounded-xl p-6 shadow-xl dark:shadow-2xl animate-in fade-in slide-in-from-bottom-4 mb-12">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 dark:border-[#2a2a38] pb-4 mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{trackingData.Shipment.AWB}</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Order ID: <span className="text-gray-700 dark:text-gray-300">{trackingData.Shipment.ReferenceNo}</span></p>
                        </div>

                        <div className={`mt-4 md:mt-0 px-4 py-2 border rounded-full text-sm font-bold tracking-wider ${getStatusColor((trackingData.Shipment.CurrentStatus || trackingData.Shipment.Status)?.StatusType || '')}`}>
                            {(trackingData.Shipment.CurrentStatus || trackingData.Shipment.Status)?.Status || 'UNKNOWN STATUS'}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                        <div className="bg-gray-50 dark:bg-[#16161f] p-3 rounded-lg border border-gray-100 dark:border-transparent">
                            <p className="text-gray-500 text-xs uppercase mb-1 font-semibold">Expected Delivery</p>
                            <p className="text-gray-900 dark:text-white font-medium">{trackingData.Shipment.ExpectedDeliveryDate ? new Date(trackingData.Shipment.ExpectedDeliveryDate).toLocaleDateString() : '—'}</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-[#16161f] p-3 rounded-lg border border-gray-100 dark:border-transparent">
                            <p className="text-gray-500 text-xs uppercase mb-1 font-semibold">Consignee</p>
                            <p className="text-gray-900 dark:text-white font-medium">{trackingData.Shipment.Consignee?.Name || '—'}</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-[#16161f] p-3 rounded-lg border border-gray-100 dark:border-transparent">
                            <p className="text-gray-500 text-xs uppercase mb-1 font-semibold">Destination</p>
                            <p className="text-gray-900 dark:text-white font-medium">{trackingData.Shipment.Destination || '—'}</p>
                        </div>
                        <div className="bg-gray-50 dark:bg-[#16161f] p-3 rounded-lg border border-gray-100 dark:border-transparent">
                            <p className="text-gray-500 text-xs uppercase mb-1 font-semibold">Amount to Collect</p>
                            <p className="text-gray-900 dark:text-white font-bold text-lg text-accent">₹{trackingData.Shipment.InvoiceAmount || 0}</p>
                        </div>
                    </div>

                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Tracking History</h3>
                    <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[#3a3a4a] before:to-transparent">
                        {trackingData.Shipment.Scans?.map((scanItem, idx) => {
                            const scan = 'ScanDetail' in scanItem ? scanItem.ScanDetail : scanItem;
                            return (
                                <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#12121a] bg-accent text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ms-0 md:mx-auto">
                                        <span className="w-2 h-2 bg-white rounded-full"></span>
                                    </div>
                                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-[#16161f] border border-[#2a2a38] p-4 rounded-xl shadow ml-4 md:ml-0 md:group-odd:mr-4 md:group-even:ml-4">
                                        <div className="flex flex-col sm:flex-row justify-between items-start mb-1">
                                            <h4 className="font-semibold text-white text-sm">{scan.ScanType || scan.Scan || '-'}</h4>
                                            <span className="text-xs text-gray-400 whitespace-nowrap mt-1 sm:mt-0 font-mono">
                                                {scan.ScanDateTime ? new Date(scan.ScanDateTime).toLocaleString() : '—'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-400">{scan.Instructions || '-'}</p>
                                        {scan.ScannedLocation && <p className="text-xs text-accent mt-2">📍 {scan.ScannedLocation}</p>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {(() => {
                        const matchOrder = dbOrders.find(o => o.waybill === trackingData.Shipment.AWB || o.orderId === trackingData.Shipment.ReferenceNo);
                        return matchOrder?.invoiceItems ? renderInvoiceItems(matchOrder.invoiceItems) : null;
                    })()}

                </div>
            ) : null}

            {/* Self-Shipped Results Area */}
            {selectedSelfShippedOrder ? (
                <div className="bg-white dark:bg-[#12121a] border border-gray-200 dark:border-[#2a2a38] rounded-xl p-6 shadow-xl dark:shadow-2xl animate-in fade-in slide-in-from-bottom-4 mb-12">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 dark:border-[#2a2a38] pb-4 mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Self-Shipped Order</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Order ID: <span className="text-gray-700 dark:text-gray-300">{selectedSelfShippedOrder.orderId}</span></p>
                        </div>
                        <div className={`mt-4 md:mt-0 px-4 py-2 border rounded-full text-sm font-bold tracking-wider text-purple-600 bg-purple-100 border-purple-200 dark:text-purple-400 dark:bg-purple-900/20 dark:border-purple-800`}>
                            {selectedSelfShippedOrder.selfShipmentStatus || 'Order Created'}
                        </div>
                    </div>

                    <div className="mb-8">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Order Status</label>
                        <select
                            className="form-input w-full md:w-1/2 p-3 text-sm bg-white dark:bg-[#16161f] text-gray-900 dark:text-white border border-gray-300 dark:border-[#2a2a38] rounded-lg focus:ring-accent focus:border-accent transition-colors"
                            value={selfShipStatusInput}
                            onChange={(e) => setSelfShipStatusInput(e.target.value)}
                        >
                            <option value="Order Created">Order Created</option>
                            <option value="Order shipped">Order shipped</option>
                            <option value="Order Completed">Order Completed</option>
                        </select>
                    </div>

                    <div className="mb-8">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Additional Notes</label>
                        <textarea
                            className="form-input w-full p-3 text-sm bg-white dark:bg-[#16161f] text-gray-900 dark:text-white border border-gray-300 dark:border-[#2a2a38] rounded-lg focus:ring-accent focus:border-accent transition-colors"
                            rows={4}
                            maxLength={500}
                            placeholder="Add tracking notes for self-shipped or pooja orders here..."
                            value={selfShipNotesInput}
                            onChange={(e) => setSelfShipNotesInput(e.target.value)}
                        />
                        <div className="text-right text-xs text-gray-400 mt-1">{selfShipNotesInput.length}/500 chars</div>
                    </div>

                    <div className="flex justify-end border-t border-gray-200 dark:border-[#2a2a38] pt-6 gap-3">
                        <button
                            className="btn bg-gray-200 hover:bg-gray-300 dark:bg-[#2a2a38] dark:hover:bg-[#3a3a4a] text-gray-800 dark:text-white py-2 px-6 rounded-lg font-medium transition-colors"
                            onClick={() => setSelectedSelfShippedOrder(null)}
                            disabled={updateSelfShipLoading}
                        >
                            Close
                        </button>
                        <button
                            className="btn btn-primary py-2 px-6 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 min-w-[140px]"
                            onClick={saveSelfShipment}
                            disabled={updateSelfShipLoading}
                        >
                            {updateSelfShipLoading ? <span className="w-5 h-5 flex-shrink-0 border-2 border-white border-t-transparent rounded-full animate-spin"></span> : 'Save Details'}
                        </button>
                    </div>

                    {renderInvoiceItems(selectedSelfShippedOrder.invoiceItems || [])}
                </div>
            ) : null}

            {!trackingData && !selectedSelfShippedOrder && dbOrders.length > 0 && (
                <div className="animate-in fade-in duration-500 mb-12">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Active Waybills</h3>
                        <span className="text-xs bg-accent/10 dark:bg-accent/20 text-accent px-3 py-1.5 rounded-full border border-accent/20 dark:border-accent/30 flex items-center gap-1.5 font-medium shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(108,99,255,0.8)]"></span> Delhivery API
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
                        {dbOrders.filter(order => {
                            if (statusFilter === 'all') return true;

                            let currentStatus = order.status;

                            if (order.isSelfShipped) {
                                currentStatus = order.selfShipmentStatus || 'Order Created';
                            }

                            return currentStatus?.toUpperCase() === statusFilter;
                        }).map((order, idx) => {
                            const isUnused = order.status === 'UNUSED';

                            let displayStatus = order.status;
                            let statusClasses = isUnused
                                ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 border border-green-200 dark:border-green-500/30'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400 border border-gray-200 dark:border-gray-500/30';

                            if (order.isSelfShipped) {
                                displayStatus = order.selfShipmentStatus || 'Order Created';
                                statusClasses = 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border border-purple-200 dark:border-purple-500/30';
                            } else if (order.status) {
                                displayStatus = displayStatus.length > 15 ? displayStatus.substring(0, 15) + '...' : displayStatus;
                                statusClasses = getStatusColor(order.status);
                            }

                            return (
                                <div
                                    key={idx}
                                    className="bg-white dark:bg-[#12121a] border border-gray-200 dark:border-[#2a2a38] hover:border-accent dark:hover:border-accent/50 p-5 rounded-xl cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-accent/5 hover:bg-gray-50 dark:hover:bg-[#16161f] group flex flex-col h-full"
                                    onClick={() => {
                                        if (order.isSelfShipped) {
                                            setSearchQuery(order.waybill || order.orderId || '');
                                            setTrackingData(null);
                                            setSelectedSelfShippedOrder(order);
                                            setSelfShipStatusInput(order.selfShipmentStatus || 'Order Created');
                                            setSelfShipNotesInput(order.selfShipmentNotes || '');
                                        } else {
                                            setSelectedSelfShippedOrder(null);
                                            setSearchQuery(order.waybill);
                                            fetchTracking(order.waybill);
                                        }
                                    }}
                                >
                                    <div className="flex justify-between items-start mb-3 gap-2">
                                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold tracking-wide flex-shrink-0 ${statusClasses}`} title={order.status}>
                                            {displayStatus}
                                        </span>
                                        <span className="text-gray-500 dark:text-gray-400 text-xs font-medium flex items-center gap-1 text-right flex-shrink-0">
                                            📅 {new Date(order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </div>
                                    <div className="mb-4 flex-grow">
                                        <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider font-semibold">{order.isSelfShipped ? 'Order Identifier' : 'Waybill Number'}</p>
                                        <p className="text-gray-900 dark:text-white font-bold text-lg group-hover:text-accent transition-colors break-all">{order.waybill || order.orderId}</p>
                                    </div>
                                    <div className="pt-3 border-t border-gray-100 dark:border-[#2a2a38] flex items-center justify-between">
                                        <div>
                                            <p className="text-xs text-gray-400 mb-0.5">Assigned Order</p>
                                            <p className="text-gray-700 dark:text-gray-300 text-sm font-medium">{order.orderId ? order.orderId : '—'}</p>
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#1c1c28] flex items-center justify-center text-gray-400 group-hover:text-accent group-hover:bg-accent/10 transition-colors flex-shrink-0">
                                            ➔
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Recent Orders Area */}
            {!trackingData && !selectedSelfShippedOrder && recentOrders.length > 0 && (
                <div className="animate-in fade-in duration-500 mb-12">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Your Recent Shipments</h3>
                        <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 font-medium flex items-center gap-1.5 shadow-sm">
                            💻 Local Device
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {recentOrders.map((order, idx) => (
                            <div
                                key={idx}
                                className="bg-white dark:bg-[#12121a] border border-gray-200 dark:border-[#2a2a38] hover:border-accent dark:hover:border-accent/50 p-5 rounded-xl cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:hover:shadow-accent/5 hover:bg-gray-50 dark:hover:bg-[#16161f] group"
                                onClick={() => {
                                    setSearchQuery(order.waybill);
                                    fetchTracking(order.waybill);
                                }}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <span className="bg-accent/10 text-accent border border-accent/20 text-xs px-2.5 py-1 rounded-full font-semibold tracking-wide flex items-center gap-1">
                                        📦 {order.orderId}
                                    </span>
                                    <span className="text-gray-500 dark:text-gray-400 text-xs font-medium flex items-center gap-1">
                                        📅 {new Date(order.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </div>
                                <div className="mb-4">
                                    <p className="text-xs text-gray-400 mb-1 uppercase tracking-wider font-semibold">Waybill Number</p>
                                    <p className="text-gray-900 dark:text-white font-bold text-lg group-hover:text-accent transition-colors">{order.waybill}</p>
                                </div>
                                <div className="pt-3 border-t border-gray-100 dark:border-[#2a2a38] flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-gray-400 mb-0.5">Consignee</p>
                                        <p className="text-gray-700 dark:text-gray-300 text-sm font-medium truncate max-w-[150px]" title={order.consignee}>{order.consignee}</p>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#1c1c28] flex items-center justify-center text-gray-400 group-hover:text-accent group-hover:bg-accent/10 transition-colors">
                                        ➔
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!trackingData && !selectedSelfShippedOrder && recentOrders.length === 0 && dbOrders.length === 0 && (
                <div className="text-center py-12 text-gray-500 border border-dashed border-[#2a2a38] rounded-xl">
                    No recent orders found on this device or database. Create one from the <Link href="/" className="text-accent hover:underline">Create Order page</Link>.
                </div>
            )}
        </div>
    );
}
