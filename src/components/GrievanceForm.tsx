'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { submitGrievance } from '@/app/(dashboard)/actions/grievanceActions';

export default function GrievanceForm({ onSuccess }: { onSuccess?: () => void }) {
    const [submitting, setSubmitting] = useState(false);
    const [customGrievanceType, setCustomGrievanceType] = useState('');
    const [formData, setFormData] = useState({
        salespersonName: '',
        orderId: '',
        grievanceType: '',
        explainIssue: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.salespersonName || !formData.orderId || !formData.grievanceType || !formData.explainIssue) {
            toast.error('Please fill in all fields');
            return;
        }

        if (formData.grievanceType === 'other' && !customGrievanceType.trim()) {
            toast.error('Please specify the grievance type');
            return;
        }

        setSubmitting(true);

        try {
            const finalGrievanceType = formData.grievanceType === 'other' ? customGrievanceType.trim() : formData.grievanceType;
            const payload = {
                ...formData,
                grievanceType: finalGrievanceType
            };
            
            const result = await submitGrievance(payload);
            if (!result.success) {
                throw new Error(result.error);
            }
            toast.success('Grievance submitted successfully');

            // Reset form
            setFormData({
                salespersonName: '',
                orderId: '',
                grievanceType: '',
                explainIssue: ''
            });
            setCustomGrievanceType('');
            
            if (onSuccess) {
                onSuccess();
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to submit grievance');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-white dark:bg-[#12121a] border border-gray-200 dark:border-[#2a2a38] rounded-xl shadow-sm p-5 mb-8 max-w-4xl mx-auto">
            <div className="mb-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Report a Grievance</h2>
                <p className="text-xs text-gray-500">Submit any issues or concerns to be addressed</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="form-group mb-0">
                        <label htmlFor="salespersonName" className="text-xs font-semibold mb-1 block">Salesperson Name *</label>
                        <select
                            id="salespersonName"
                            name="salespersonName"
                            className="form-input text-sm p-2"
                            value={formData.salespersonName}
                            onChange={handleChange}
                            required
                        >
                            <option value="" disabled>Select a salesperson</option>
                            <option value="daksh">Daksh</option>
                        </select>
                    </div>

                    <div className="form-group mb-0">
                        <label htmlFor="orderId" className="text-xs font-semibold mb-1 block">Order ID *</label>
                        <input
                            type="text"
                            id="orderId"
                            name="orderId"
                            className="form-input text-sm p-2"
                            placeholder="Eg: INV-000101"
                            value={formData.orderId}
                            onChange={handleChange}
                            required
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="form-group mb-0">
                        <label htmlFor="grievanceType" className="text-xs font-semibold mb-1 block">Grievance Type *</label>
                        <select
                            id="grievanceType"
                            name="grievanceType"
                            className="form-input text-sm p-2"
                            value={formData.grievanceType}
                            onChange={handleChange}
                            required
                        >
                            <option value="" disabled>Select a grievance type</option>
                            <option value="amount_gt_2000">Amount &gt; 2000</option>
                            <option value="need_solution">Need to figure out solution</option>
                            <option value="order_returned">Order Returned</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    {formData.grievanceType === 'other' && (
                        <div className="form-group mb-0 animate-in fade-in">
                            <label htmlFor="customGrievanceType" className="text-xs font-semibold mb-1 block">Specify Grievance *</label>
                            <input
                                type="text"
                                id="customGrievanceType"
                                className="form-input text-sm p-2"
                                placeholder="Enter grievance type..."
                                value={customGrievanceType}
                                onChange={(e) => setCustomGrievanceType(e.target.value)}
                                required
                            />
                        </div>
                    )}
                </div>

                <div className="form-group mb-0">
                    <label htmlFor="explainIssue" className="text-xs font-semibold mb-1 block">Explain Issue *</label>
                    <textarea
                        id="explainIssue"
                        name="explainIssue"
                        className="form-input text-sm p-2"
                        placeholder="Please explain the issue in detail..."
                        value={formData.explainIssue}
                        onChange={handleChange}
                        required
                        rows={3}
                    />
                </div>

                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        className="btn btn-primary py-2 px-6 text-sm"
                        disabled={submitting}
                    >
                        {submitting ? (
                            <span className="flex items-center gap-2 justify-center">
                                <span className="btn-spinner">↻</span> Submitting...
                            </span>
                        ) : 'Submit Grievance'}
                    </button>
                </div>
            </form>
        </div>
    );
}
