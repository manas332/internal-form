'use client';

import { useState } from 'react';
import { toast } from 'sonner';

export default function GrievanceForm() {
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        salespersonName: '',
        awb: '',
        grievanceType: '',
        explainIssue: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.salespersonName || !formData.awb || !formData.grievanceType || !formData.explainIssue) {
            toast.error('Please fill in all fields');
            return;
        }

        setSubmitting(true);

        try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            toast.success('Grievance submitted successfully');

            // Reset form
            setFormData({
                salespersonName: '',
                awb: '',
                grievanceType: '',
                explainIssue: ''
            });
        } catch (error) {
            toast.error('Failed to submit grievance');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="invoice-form" style={{ marginTop: '2rem' }}>
            <div className="form-header">
                <h1>Report a Grievance</h1>
                <p>Submit any issues or concerns to be addressed</p>
            </div>

            <form onSubmit={handleSubmit} className="form-section">
                <div className="form-grid-2 mb-4">
                    <div className="form-group">
                        <label htmlFor="salespersonName">Salesperson Name *</label>
                        <input
                            type="text"
                            id="salespersonName"
                            name="salespersonName"
                            className="form-input"
                            placeholder="Enter salesperson name"
                            value={formData.salespersonName}
                            onChange={handleChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="awb">AWB *</label>
                        <input
                            type="text"
                            id="awb"
                            name="awb"
                            className="form-input"
                            placeholder="Enter AWB number"
                            value={formData.awb}
                            onChange={handleChange}
                            required
                        />
                    </div>
                </div>

                <div className="form-group mb-4">
                    <label htmlFor="grievanceType">Grievance Type *</label>
                    <select
                        id="grievanceType"
                        name="grievanceType"
                        className="form-input"
                        value={formData.grievanceType}
                        onChange={handleChange}
                        required
                    >
                        <option value="" disabled>Select a grievance type</option>
                        <option value="amount_gt_2000">Amount &gt; 2000</option>
                        <option value="need_solution">Need to figure out solution</option>
                    </select>
                </div>

                <div className="form-group mb-4">
                    <label htmlFor="explainIssue">Explain Issue *</label>
                    <textarea
                        id="explainIssue"
                        name="explainIssue"
                        className="form-input form-textarea"
                        placeholder="Please explain the issue in detail..."
                        value={formData.explainIssue}
                        onChange={handleChange}
                        required
                        rows={4}
                    />
                </div>

                <div className="form-submit-section mt-6">
                    <button
                        type="submit"
                        className="btn btn-submit"
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
