'use client';

import { useState } from 'react';


interface SuccessModalProps {
    invoiceId: string;
    invoiceNumber: string;
    total: number;
    customerName: string;
    currencySymbol: string;
    onClose: () => void;
    onNewInvoice: () => void;
}

export default function SuccessModal({
    invoiceId,
    invoiceNumber,
    total,
    customerName,
    currencySymbol,
    onClose,
    onNewInvoice,
}: SuccessModalProps) {
    const [downloading, setDownloading] = useState(false);

    const handleDownloadPdf = async () => {
        setDownloading(true);
        try {
            const res = await fetch(`/api/invoices/${invoiceId}/pdf`);

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Failed to download PDF: ${res.status} — ${errorText}`);
            }

            const blob = await res.blob();

            if (blob.size === 0) {
                throw new Error('Received empty PDF file');
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${invoiceNumber}.pdf`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();

            // Small delay before cleanup to ensure download starts
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
        } catch {
            alert('Failed to download PDF. Please try again.');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-icon">✓</div>
                <h2>Invoice Created!</h2>
                <div className="modal-details">
                    <div className="modal-detail-row">
                        <span className="modal-label">Invoice #</span>
                        <span className="modal-value">{invoiceNumber}</span>
                    </div>
                    <div className="modal-detail-row">
                        <span className="modal-label">Customer</span>
                        <span className="modal-value">{customerName}</span>
                    </div>
                    <div className="modal-detail-row">
                        <span className="modal-label">Total</span>
                        <span className="modal-value modal-total">
                            {currencySymbol}
                            {total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                    </div>
                </div>
                <div className="modal-actions">
                    <button
                        className="btn btn-primary"
                        onClick={handleDownloadPdf}
                        disabled={downloading}
                    >
                        {downloading ? (
                            <>
                                <span className="btn-spinner">⟳</span> Downloading...
                            </>
                        ) : (
                            <>📄 Download PDF</>
                        )}
                    </button>
                    <button className="btn btn-secondary" onClick={onNewInvoice}>
                        + New Invoice
                    </button>
                </div>
            </div>
        </div>
    );
}
