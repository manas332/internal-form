'use client';

import { useState } from 'react';
import { CombinedFormData } from '@/types/wizard';

interface Props {
    formData: CombinedFormData;
    onReset: () => void;
}

export default function OrderConfirmationStep({ formData, onReset }: Props) {
    const [downloadingInvoice, setDownloadingInvoice] = useState(false);

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const handleDownloadInvoice = async () => {
        if (!formData.invoiceId) return;
        setDownloadingInvoice(true);
        try {
            const res = await fetch(`/api/invoices/${formData.invoiceId}/pdf`);
            if (!res.ok) throw new Error('Failed to download invoice pdf');
            const blob = await res.blob();
            downloadBlob(blob, `invoice-${formData.orderId}.pdf`);
        } catch (e) {
            console.error(e);
            alert('Error downloading invoice.');
        } finally {
            setDownloadingInvoice(false);
        }
    };

    return (
        <div className="form-section animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-8">

            <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 border-2 border-green-500/50">
                ✓
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">Invoice Created Successfully!</h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
                The invoice has been generated in Zoho Billing and the order is saved as Pending Shipping.
            </p>

            <div className="flex justify-center items-stretch max-w-sm mx-auto mb-10">
                {/* Invoice Card */}
                <div className="w-full bg-[#16161f] p-5 rounded-xl border border-[#2a2a38]">
                    <h4 className="text-gray-400 text-sm uppercase tracking-wider mb-1">Zoho Invoice</h4>
                    <p className="text-xl font-bold text-white mb-4">{formData.orderId}</p>
                    <button
                        className="btn btn-secondary w-full"
                        onClick={handleDownloadInvoice}
                        disabled={downloadingInvoice}
                    >
                        {downloadingInvoice ? 'Downloading...' : '📄 Download Invoice PDF'}
                    </button>
                </div>
            </div>

            <button className="btn btn-link text-lg group" onClick={onReset}>
                + Create Another Order
                <span className="block h-px bg-accent w-0 group-hover:w-full transition-all duration-300"></span>
            </button>
        </div>
    );
}
