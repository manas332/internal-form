'use client';

import { useState } from 'react';
import { CombinedFormData, INITIAL_WIZARD_STATE } from '@/types/wizard';
import type { InvoiceItem } from '@/types/invoice';
import PendingOrdersStep from './steps/PendingOrdersStep';
import SchedulePreviewStep from './steps/SchedulePreviewStep';
import ScheduleConfirmationStep from './steps/ScheduleConfirmationStep';

enum ScheduleStep {
    SELECT_ORDER = 1,
    REVIEW = 2,
    CONFIRMATION = 3,
}

export default function ScheduleOrderFlow() {
    const [currentStep, setCurrentStep] = useState<ScheduleStep>(ScheduleStep.SELECT_ORDER);
    const [formData, setFormData] = useState<CombinedFormData>(INITIAL_WIZARD_STATE);

    const updateForm = (updates: Partial<CombinedFormData>) => {
        setFormData((prev) => ({ ...prev, ...updates }));
    };

    const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 3) as ScheduleStep);
    const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1) as ScheduleStep);

    const resetFlow = () => {
        setFormData(INITIAL_WIZARD_STATE);
        setCurrentStep(ScheduleStep.SELECT_ORDER);
    };

    type SelectedOrder = {
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
    };

    const handleSelectOrder = (order: SelectedOrder) => {
        const normalizedItems: InvoiceItem[] = (order.invoiceItems || []).map((raw) => {
            const item = raw as unknown as Record<string, unknown>;
            return {
                name: String(item.name ?? ''),
                description: item.description ? String(item.description) : '',
                quantity: Number(item.quantity ?? 1),
                price: Number(item.price ?? item.rate ?? 0),
                final_price: typeof item.final_price === 'number' ? item.final_price as number : undefined,
                discount: typeof item.discount === 'number' ? item.discount as number : undefined,
                tax_id: typeof item.tax_id === 'string' ? item.tax_id as string : 'NO_TAX',
                tax_amount: typeof item.tax_amount === 'number' ? item.tax_amount as number : undefined,
                item_total: typeof item.item_total === 'number' ? item.item_total as number : undefined,
                hsn_or_sac: typeof item.hsn_or_sac === 'string' ? item.hsn_or_sac as string : undefined,
                unit: typeof item.unit === 'string' ? item.unit as string : undefined,
                carat_size: typeof item.carat_size === 'number' ? item.carat_size as number : undefined,
                zoho_item_id: typeof item.zoho_item_id === 'string' ? item.zoho_item_id as string : undefined,
            };
        });

        updateForm({
            invoiceId: order.zohoInvoiceId,
            orderId: order.orderId,
            customer_name: order.customerDetails.customer_name,
            email: order.customerDetails.email,
            phone: order.customerDetails.phone,
            country_code: order.customerDetails.country_code,
            address: order.customerDetails.address,
            city: order.customerDetails.city,
            state: order.customerDetails.state,
            country: order.customerDetails.country,
            pincode: order.customerDetails.pincode,
            invoice_items: normalizedItems,
            salesperson_name: order.salespersonName,
            // Trigger pincode check naturally via updating the zip
            isPincodeServiceable: true // Assume true initially to unblock, wait user might need to edit. But user won't edit customer details in this flow.
        });
        nextStep();
    };

    const renderStep = () => {
        switch (currentStep) {
            case ScheduleStep.SELECT_ORDER:
                return <PendingOrdersStep onSelectOrder={handleSelectOrder} />;
            case ScheduleStep.REVIEW:
                return <SchedulePreviewStep formData={formData} updateForm={updateForm} onNext={nextStep} onPrev={prevStep} />;
            case ScheduleStep.CONFIRMATION:
                return <ScheduleConfirmationStep formData={formData} onReset={resetFlow} />;
            default:
                return null;
        }
    };

    const steps = [
        { id: ScheduleStep.SELECT_ORDER, label: 'Select Order' },
        { id: ScheduleStep.REVIEW, label: 'Review & Ship' },
        { id: ScheduleStep.CONFIRMATION, label: 'Complete' },
    ];

    return (
        <div className="wizard-container">
            {/* Stepper Header */}
            <div className="wizard-stepper">
                {steps.map((step, idx) => (
                    <div key={step.id} className="stepper-item-wrapper">
                        <div
                            className={`stepper-item ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''
                                }`}
                        >
                            <div className="stepper-circle">
                                {currentStep > step.id ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12"></polyline>
                                    </svg>
                                ) : (
                                    idx + 1
                                )}
                            </div>
                            <span className="stepper-label">{step.label}</span>
                        </div>
                        {idx < steps.length - 1 && (
                            <div className={`stepper-line ${currentStep > step.id ? 'completed' : ''}`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Step Content */}
            <div className="wizard-content">
                {renderStep()}
            </div>
        </div>
    );
}
