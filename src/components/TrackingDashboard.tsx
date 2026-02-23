'use client';

import { useState, useEffect } from 'react';
import { TrackingShipmentData, TrackingScan } from '@/types/delhivery';

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
}

export default function TrackingDashboard() {
    const [recentOrders, setRecentOrders] = useState<StoredOrder[]>([]);
    const [dbOrders, setDbOrders] = useState<DBWaybill[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [trackingData, setTrackingData] = useState<TrackingShipmentData | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    // Load from localStorage and Database on mount
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

        // Load DB orders
        const fetchDbOrders = async () => {
            try {
                const res = await fetch('/api/waybills/recent');
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        setDbOrders(data.waybills);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch recent DB waybills', err);
            }
        };

        fetchDbOrders();
    }, []);

    const fetchTracking = async (query: string) => {
        if (!query.trim()) return;
        setLoading(true);
        setErrorMsg('');
        setTrackingData(null);

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
                <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent mb-2">
                    Track Shipments
                </h1>
                <p className="text-gray-400">Search by Waybill Number or Order ID</p>
            </div>

            {/* Search Bar */}
            <div className="flex gap-3 mb-12 max-w-2xl mx-auto">
                <input
                    type="text"
                    className="form-input flex-1 p-3 text-lg bg-[#16161f]"
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

            {errorMsg && (
                <div className="form-error max-w-2xl mx-auto mb-8">
                    {errorMsg}
                </div>
            )}

            {/* Tracking Results Area */}
            {trackingData ? (
                <div className="bg-[#12121a] border border-[#2a2a38] rounded-xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4 mb-12">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[#2a2a38] pb-4 mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1">{trackingData.Shipment.AWB}</h2>
                            <p className="text-gray-400 text-sm">Order ID: {trackingData.Shipment.ReferenceNo}</p>
                        </div>

                        <div className={`mt-4 md:mt-0 px-4 py-2 border rounded-full text-sm font-bold tracking-wider ${getStatusColor(trackingData.Shipment.CurrentStatus?.StatusType)}`}>
                            {trackingData.Shipment.CurrentStatus?.Status || 'UNKNOWN STATUS'}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                        <div>
                            <p className="text-gray-500 text-xs uppercase mb-1">Expected Delivery</p>
                            <p className="text-white font-medium">{trackingData.Shipment.ExpectedDeliveryDate ? new Date(trackingData.Shipment.ExpectedDeliveryDate).toLocaleDateString() : '—'}</p>
                        </div>
                        <div>
                            <p className="text-gray-500 text-xs uppercase mb-1">Consignee</p>
                            <p className="text-white font-medium">{trackingData.Shipment.Consignee?.Name || '—'}</p>
                        </div>
                        <div>
                            <p className="text-gray-500 text-xs uppercase mb-1">Destination</p>
                            <p className="text-white font-medium">{trackingData.Shipment.Destination || '—'}</p>
                        </div>
                        <div>
                            <p className="text-gray-500 text-xs uppercase mb-1">Amount to Collect</p>
                            <p className="text-white font-medium">₹{trackingData.Shipment.InvoiceAmount || 0}</p>
                        </div>
                    </div>

                    <h3 className="text-lg font-semibold text-white mb-4">Tracking History</h3>
                    <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[#3a3a4a] before:to-transparent">
                        {trackingData.Shipment.Scans?.map((scan, idx) => (
                            <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#12121a] bg-accent text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 ms-0 md:mx-auto">
                                    <span className="w-2 h-2 bg-white rounded-full"></span>
                                </div>
                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-[#16161f] border border-[#2a2a38] p-4 rounded-xl shadow ml-4 md:ml-0 md:group-odd:mr-4 md:group-even:ml-4">
                                    <div className="flex flex-col sm:flex-row justify-between items-start mb-1">
                                        <h4 className="font-semibold text-white text-sm">{scan.ScanType || scan.Scan}</h4>
                                        <span className="text-xs text-gray-400 whitespace-nowrap mt-1 sm:mt-0 font-mono">
                                            {new Date(scan.ScanDateTime).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-400">{scan.Instructions || '-'}</p>
                                    {scan.ScannedLocation && <p className="text-xs text-accent mt-2">📍 {scan.ScannedLocation}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {!trackingData && dbOrders.length > 0 && (
                <div className="animate-in fade-in duration-500 mb-12">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-white">Allocated Waybills</h3>
                        <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded-full border border-accent/30 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span> Database
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {dbOrders.map((order, idx) => (
                            <div
                                key={idx}
                                className="bg-[#12121a] border border-[#2a2a38] hover:border-accent/50 p-4 rounded-xl cursor-pointer transition-all hover:bg-[#16161f]"
                                onClick={() => {
                                    setSearchQuery(order.waybill);
                                    if (order.status === 'UNUSED') {
                                        setErrorMsg('This pre-allocated waybill has not been dispatched yet.');
                                        setTrackingData(null);
                                    } else {
                                        fetchTracking(order.waybill);
                                    }
                                }}
                            >
                                <div className="flex justify-between items-center mb-2 gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${order.status === 'UNUSED' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                        {order.status}
                                    </span>
                                    <span className="text-gray-500 text-xs text-right whitespace-nowrap">
                                        {new Date(order.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <p className="text-white font-bold mb-1">{order.waybill}</p>
                                <p className="text-gray-400 text-sm">{order.orderId ? `Order: ${order.orderId}` : 'Not assigned to order yet'}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Orders Area */}
            {!trackingData && recentOrders.length > 0 && (
                <div className="animate-in fade-in duration-500 mb-12">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-white">Your Recent Shipments</h3>
                        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full border border-gray-700">Local Device</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {recentOrders.map((order, idx) => (
                            <div
                                key={idx}
                                className="bg-[#12121a] border border-[#2a2a38] hover:border-accent/50 p-4 rounded-xl cursor-pointer transition-all hover:bg-[#16161f]"
                                onClick={() => {
                                    setSearchQuery(order.waybill);
                                    fetchTracking(order.waybill);
                                }}
                            >
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-accent text-sm font-medium">{order.orderId}</span>
                                    <span className="text-gray-500 text-xs">{new Date(order.date).toLocaleDateString()}</span>
                                </div>
                                <p className="text-white font-bold mb-1">{order.waybill}</p>
                                <p className="text-gray-400 text-sm">{order.consignee}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!trackingData && recentOrders.length === 0 && dbOrders.length === 0 && (
                <div className="text-center py-12 text-gray-500 border border-dashed border-[#2a2a38] rounded-xl">
                    No recent orders found on this device or database. Create one from the <a href="/" className="text-accent hover:underline">Create Order page</a>.
                </div>
            )}
        </div>
    );
}
