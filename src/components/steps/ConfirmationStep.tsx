'use client';

import { useState } from 'react';
import { CombinedFormData } from '@/types/wizard';

interface Props {
    formData: CombinedFormData;
    onReset: () => void;
}

export default function ConfirmationStep({ formData, onReset }: Props) {
    const [downloadingInvoice, setDownloadingInvoice] = useState(false);
    const [downloadingLabel, setDownloadingLabel] = useState(false);
    const [creatingPickup, setCreatingPickup] = useState(false);
    const [pickupRequested, setPickupRequested] = useState(false);

    const [pickupDate, setPickupDate] = useState(new Date().toISOString().split('T')[0]);
    const [pickupTime, setPickupTime] = useState('11:00:00');
    const [pickupError, setPickupError] = useState('');

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

    const handleDownloadLabel = async () => {
        if (!formData.waybill) return;
        setDownloadingLabel(true);
        try {
            const res = await fetch(`/api/delhivery/label?waybill=${formData.waybill}&pdf_size=A4`);
            if (!res.ok) throw new Error('Failed to get label link');
            const data = await res.json();

            if (data.packages_found > 0 && data.packages[0].pdf_download_link) {
                // Since it returns an S3 link (often HTTP but needs to be opened), we can just open it in new tab
                window.open(data.packages[0].pdf_download_link, '_blank');
            } else {
                alert('Label generation pending or failed on Delhivery side.');
            }
        } catch (e) {
            console.error(e);
            alert('Error fetching label.');
        } finally {
            setDownloadingLabel(false);
        }
    };

    const handleRequestPickup = async () => {
        setCreatingPickup(true);
        setPickupError('');
        try {
            const res = await fetch('/api/delhivery/pickup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pickup_date: pickupDate,
                    pickup_time: pickupTime,
                    pickup_location: formData.warehouse,
                    expected_package_count: 1
                })
            });

            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || 'Failed to request pickup');

            setPickupRequested(true);
        } catch (e) {
            console.error(e);
            setPickupError(e instanceof Error ? e.message : 'Error requesting pickup');
        } finally {
            setCreatingPickup(false);
        }
    };

    return (
        <div className="form-section animate-in fade-in slide-in-from-bottom-4 duration-500 text-center py-8">

            <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center text-4xl mx-auto mb-6 border-2 border-green-500/50">
                ✓
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">Order Created Successfully!</h2>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
                The invoice has been generated in Zoho Billing and the shipment label is ready via Delhivery.
            </p>

            <div className="flex flex-col md:flex-row gap-6 justify-center items-stretch max-w-2xl mx-auto mb-10">
                {/* Invoice Card */}
                <div className="flex-1 bg-[#16161f] p-5 rounded-xl border border-[#2a2a38]">
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

                {/* Shipment Card */}
                <div className="flex-1 bg-[#16161f] p-5 rounded-xl border border-accent/30">
                    <h4 className="text-accent text-sm uppercase tracking-wider mb-1">Delhivery Waybill</h4>
                    <p className="text-xl font-bold text-white mb-4">{formData.waybill}</p>
                    <button
                        className="btn btn-primary w-full"
                        onClick={handleDownloadLabel}
                        disabled={downloadingLabel}
                    >
                        {downloadingLabel ? 'Fetching...' : '🏷️ Download Label (A4)'}
                    </button>
                </div>
            </div>

            {/* Pickup Request Section */}
            <div className="max-w-md mx-auto bg-[#16161f] border border-[#2a2a38] rounded-xl p-5 mb-10 text-left">
                <h4 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <span>📦</span> Schedule Pickup
                </h4>

                {pickupRequested ? (
                    <div className="bg-green-500/10 border border-green-500/30 text-green-400 p-3 rounded-lg text-sm flex items-center gap-2">
                        ✓ Pickup request submitted successfully for {formData.warehouse}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {pickupError && <div className="text-red-400 text-sm">{pickupError}</div>}
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="text-xs text-gray-400">Date</label>
                                <input
                                    type="date"
                                    className="form-input text-sm"
                                    value={pickupDate}
                                    onChange={e => setPickupDate(e.target.value)}
                                />
                            </div>
                            <div className="flex-1">
                                <label className="text-xs text-gray-400">Time</label>
                                <input
                                    type="time"
                                    className="form-input text-sm"
                                    value={pickupTime}
                                    onChange={e => setPickupTime(e.target.value)}
                                />
                            </div>
                        </div>
                        <button
                            className="btn bg-[#2a2a38] hover:bg-[#3a3a4a] text-white w-full border border-[#3a3a4a]"
                            onClick={handleRequestPickup}
                            disabled={creatingPickup}
                        >
                            {creatingPickup ? 'Scheduling...' : 'Schedule Pickup Request'}
                        </button>
                    </div>
                )}
            </div>

            <button className="btn btn-link text-lg group" onClick={onReset}>
                + Create Another Order
                <span className="block h-px bg-accent w-0 group-hover:w-full transition-all duration-300"></span>
            </button>

        </div>
    );
}
