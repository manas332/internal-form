'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

interface Order {
    _id: string;
    zohoInvoiceId: string;
    orderId: string;
    customerDetails: {
        customer_name: string;
        email: string;
        phone: string;
        city: string;
        state: string;
        pincode: string;
    };
    status: string;
    createdAt: string;
}

export default function AdminPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const fetchAllOrders = async () => {
        try {
            setLoading(true);
            // Fetch ALL orders (not just pending) — custom endpoint
            const res = await fetch('/api/orders?all=true');
            const data = await res.json();
            if (res.ok && data.success) {
                setOrders(data.orders);
            }
        } catch {
            toast.error('Failed to fetch orders');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllOrders();
    }, []);

    const handleDelete = async (order: Order) => {
        setDeletingId(order._id);
        try {
            const res = await fetch(`/api/orders/${order.orderId}`, {
                method: 'DELETE',
            });
            const data = await res.json();

            if (res.ok && data.success) {
                toast.success(data.message);
                setOrders(prev => prev.filter(o => o._id !== order._id));
            } else {
                toast.error(data.error || 'Failed to delete');
            }
        } catch {
            toast.error('Network error while deleting');
        } finally {
            setDeletingId(null);
            setConfirmId(null);
        }
    };

    const statusColors: Record<string, string> = {
        PENDING_SHIPPING: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
        PARTIALLY_SHIPPED: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
        SHIPPED: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
        SELF_SHIPPED: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400',
    };

    if (loading) {
        return (
            <div className="app-container">
                <div className="wizard-container">
                    <div className="form-section flex justify-center py-10">
                        <div className="btn-spinner border-[3px] border-accent border-t-transparent rounded-full w-8 h-8"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <div className="wizard-container">
                <div className="form-section animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="section-title mb-0">
                            <span className="section-icon">⚙️</span> Admin Panel — All Orders
                        </h3>
                        <button
                            onClick={fetchAllOrders}
                            className="text-sm text-accent hover:underline flex items-center gap-1"
                        >
                            ↻ Refresh
                        </button>
                    </div>

                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        Deleting an order removes it from the database and attempts to delete the invoice from Zoho Billing.
                        Zoho only allows deleting <strong>Draft</strong> invoices — Sent/Paid invoices may need manual voiding.
                    </p>

                    {orders.length === 0 ? (
                        <div className="text-center py-12 bg-white dark:bg-[#16161f] rounded-xl border border-dashed border-gray-300 dark:border-[#2a2a38]">
                            <span className="text-4xl block mb-2">📭</span>
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No orders found</h3>
                        </div>
                    ) : (
                        <div className="grid gap-3">
                            {orders.map(order => (
                                <div
                                    key={order._id}
                                    className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-xl p-4 flex items-center justify-between"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1">
                                            <span className="font-bold text-gray-900 dark:text-white">
                                                {order.orderId}
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColors[order.status] || 'bg-gray-100 text-gray-600'}`}>
                                                {order.status}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-x-4 gap-y-1">
                                            <span>👤 {order.customerDetails.customer_name}</span>
                                            <span>📅 {new Date(order.createdAt).toLocaleDateString()}</span>
                                            {order.customerDetails.city && (
                                                <span>📍 {order.customerDetails.city}, {order.customerDetails.state}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 ml-4 shrink-0">
                                        {confirmId === order._id ? (
                                            <>
                                                <button
                                                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                                                    onClick={() => handleDelete(order)}
                                                    disabled={deletingId === order._id}
                                                >
                                                    {deletingId === order._id ? 'Deleting...' : 'Confirm Delete'}
                                                </button>
                                                <button
                                                    className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-[#2a2a38] text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-300 dark:hover:bg-[#35354a] transition-colors"
                                                    onClick={() => setConfirmId(null)}
                                                >
                                                    Cancel
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                className="text-xs px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                                onClick={() => setConfirmId(order._id)}
                                            >
                                                🗑 Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="mt-4 text-xs text-gray-400 text-right">
                        {orders.length} order{orders.length !== 1 ? 's' : ''} total
                    </div>
                </div>
            </div>
        </div>
    );
}
