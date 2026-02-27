'use client';

import { useState, useEffect } from 'react';
import type { InvoiceItem } from '@/types/invoice';

interface Order {
    _id: string;
    zohoInvoiceId: string;
    orderId: string;
    customerDetails: {
        customer_name: string;
        email: string;
        phone: string;
        country_code: string;
        address: string;
        city: string;
        state: string;
        country: string;
        pincode: string;
    };
    invoiceItems: InvoiceItem[];
    salespersonName: string;
    status: string;
    createdAt: string;
}

interface Props {
    onSelectOrder: (order: Order) => void;
}

export default function PendingOrdersStep({ onSelectOrder }: Props) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/orders');
            const data = await res.json();
            if (res.ok && data.success) {
                setOrders(data.orders);
            } else {
                throw new Error(data.error || 'Failed to fetch orders');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="form-section flex justify-center py-10">
                <div className="btn-spinner border-[3px] border-accent border-t-transparent rounded-full w-8 h-8"></div>
            </div>
        );
    }

    return (
        <div className="form-section animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-6">
                <h3 className="section-title mb-0">
                    <span className="section-icon">📋</span> Pending Orders
                </h3>
                <button onClick={fetchOrders} className="text-sm text-accent hover:underline flex items-center gap-1">
                    ↻ Refresh
                </button>
            </div>

            {error && (
                <div className="form-error">
                    {error}
                </div>
            )}

            {orders.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-[#16161f] rounded-xl border border-dashed border-gray-300 dark:border-[#2a2a38]">
                    <span className="text-4xl block mb-2">🎉</span>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">All caught up!</h3>
                    <p className="text-gray-500">No pending orders to schedule.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {orders.map(order => (
                        <div
                            key={order._id}
                            className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-[#2a2a38] rounded-xl p-5 hover:border-accent/50 transition-colors cursor-pointer group flex items-center justify-between"
                            onClick={() => onSelectOrder(order)}
                        >
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="font-bold text-lg text-gray-900 dark:text-white">{order.orderId}</span>
                                    <span className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 px-2 py-0.5 rounded font-medium">PENDING</span>
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-4">
                                    <span>👤 {order.customerDetails.customer_name}</span>
                                    {order.salespersonName && <span>🧑‍💼 {order.salespersonName}</span>}
                                    <span>📅 {new Date(order.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div className="mt-2 text-xs text-gray-500">
                                    {order.customerDetails.city}, {order.customerDetails.state} {order.customerDetails.pincode}
                                </div>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="btn btn-secondary py-1.5 px-4 text-sm">Schedule ➔</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
