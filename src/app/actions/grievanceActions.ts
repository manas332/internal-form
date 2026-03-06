'use server';

import { Resend } from 'resend';

// Initialize with the API key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

export async function submitGrievance(data: { salespersonName: string, orderId: string, grievanceType: string, explainIssue: string }) {
    try {
        const { salespersonName, orderId, grievanceType, explainIssue } = data;

        if (!salespersonName || !orderId || !grievanceType || !explainIssue) {
            return { success: false, error: 'All fields are required' };
        }

        const fromEmail = `${salespersonName.toLowerCase().trim()}@humarapandit.com`;

        const response = await resend.emails.send({
            from: fromEmail,
            to: 'divyam@humarapandit.com',
            subject: `Grievance Report - Order ID: ${orderId}`,
            html: `
                <h2>New Grievance Report</h2>
                <p><strong>Salesperson:</strong> ${salespersonName}</p>
                <p><strong>Order ID:</strong> ${orderId}</p>
                <p><strong>Grievance Type:</strong> ${grievanceType}</p>
                <p><strong>Issue Details:</strong></p>
                <p>${explainIssue.replace(/\n/g, '<br/>')}</p>
            `
        });

        if (response.error) {
            console.error('Resend error:', response.error);
            return { success: false, error: response.error.message };
        }

        return { success: true };
    } catch (error: any) {
        console.error('Error submitting grievance:', error);
        return { success: false, error: error.message || 'Internal server error' };
    }
}
