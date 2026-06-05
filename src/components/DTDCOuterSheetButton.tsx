'use client';

import { useState } from 'react';

export default function DTDCOuterSheetButton() {
    const [isOpen, setIsOpen] = useState(false);
    
    const toLocalISOString = (date: Date) => {
        const tzOffset = date.getTimezoneOffset() * 60000; // offset in milliseconds
        const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, -1);
        return localISOTime.slice(0, 16);
    };

    // Default start date: yesterday 12 PM local time
    const getInitialStart = () => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        d.setHours(12, 0, 0, 0);
        return toLocalISOString(d); // format: YYYY-MM-DDThh:mm in local time
    };

    // Default end date: now local time
    const getInitialEnd = () => {
        const d = new Date();
        return toLocalISOString(d);
    };

    const [startDate, setStartDate] = useState(getInitialStart());
    const [endDate, setEndDate] = useState(getInitialEnd());
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleDownload = async () => {
        setLoading(true);
        setErrorMsg('');
        try {
            const res = await fetch(`/api/dtdc/download-outer?start=${new Date(startDate).toISOString()}&end=${new Date(endDate).toISOString()}`);
            if (!res.ok) {
                throw new Error('Failed to export DTDC Outer orders');
            }
            const data = await res.json();
            
            if (data.success && data.files) {
                 if (data.files.length === 0) {
                     setErrorMsg('No DTDC Scheduled orders found in this time range.');
                     setLoading(false);
                     return;
                 }
                
                // Trigger download for each file
                data.files.forEach((file: { filename: string; content: string }) => {
                    // Add UTF-8 BOM (\ufeff) to force Excel to read the file correctly with Rupee symbols
                    const blob = new Blob(['\ufeff' + file.content], { type: 'text/csv;charset=utf-8;' });
                    const url = window.URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = file.filename;
                    document.body.appendChild(a);
                    a.click();
                    
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                });
                
                setIsOpen(false);
            } else {
                setErrorMsg(data.error || 'Unknown error occurred');
            }
        } catch (err: any) {
            setErrorMsg(err.message || 'Error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button 
                onClick={() => { setEndDate(toLocalISOString(new Date())); setIsOpen(true); }}
                className="btn btn-secondary py-2 px-4 text-sm font-semibold flex items-center gap-2 bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800 dark:hover:bg-pink-900/50"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                DTDC Outer sheet
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#16161f] rounded-2xl shadow-xl w-full max-w-md p-6 border border-gray-200 dark:border-[#2a2a38] animate-in slide-in-from-bottom-4 zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-5">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <span className="text-pink-500 bg-pink-50 dark:bg-pink-900/30 p-1.5 rounded-lg">
                                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                </span>
                                DTDC Outer Sheet Export
                            </h3>
                            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        
                        <div className="space-y-4 mb-6 text-sm">
                            <p className="text-gray-600 dark:text-gray-400">
                                Select the time range to export the DTDC Outer sheet for scheduled orders.
                            </p>
                            
                            {errorMsg && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium flex items-start gap-2 border border-red-100 dark:border-red-900/30">
                                    <svg width="16" height="16" className="mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                    {errorMsg}
                                </div>
                            )}

                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1.5">Start Time</label>
                                <input
                                    type="datetime-local"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="form-input w-full"
                                />
                            </div>
                            
                            <div>
                                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1.5">End Time</label>
                                <input
                                    type="datetime-local"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="form-input w-full"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-[#2a2a38]">
                            <button
                                onClick={() => setIsOpen(false)}
                                className="px-5 py-2.5 font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2a2a38] rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDownload}
                                disabled={loading}
                                className="btn btn-submit py-2.5 px-6"
                            >
                                {loading ? (
                                    <><span className="btn-spinner border-2 border-white border-t-transparent inline-block w-4 h-4 mr-2"></span> Generating...</>
                                ) : (
                                    'Download CSVs'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
