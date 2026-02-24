'use client';

import { useState } from 'react';
import { CombinedFormData, INITIAL_WIZARD_STATE } from '@/types/wizard';
import PendingOrdersStep from './steps/PendingOrdersStep';
import ShippingStep from './steps/ShippingStep';
import SchedulePreviewStep from './steps/SchedulePreviewStep';
import ScheduleConfirmationStep from './steps/ScheduleConfirmationStep';

enum ScheduleStep {
    SELECT_ORDER = 1,
    SHIPPING = 2,
    PREVIEW = 3,
    CONFIRMATION = 4,
}

export default function ScheduleOrderFlow() {
    const [currentStep, setCurrentStep] = useState<ScheduleStep>(ScheduleStep.SELECT_ORDER);
    const [formData, setFormData] = useState<CombinedFormData>(INITIAL_WIZARD_STATE);

    const updateForm = (updates: Partial<CombinedFormData>) => {
        setFormData((prev) => ({ ...prev, ...updates }));
    };

    const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4) as ScheduleStep);
    const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1) as ScheduleStep);

    const resetFlow = () => {
        setFormData(INITIAL_WIZARD_STATE);
        setCurrentStep(ScheduleStep.SELECT_ORDER);
    };

    const handleSelectOrder = (order: any) => {
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
            invoice_items: order.invoiceItems,
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
            case ScheduleStep.SHIPPING:
                return <ShippingStep formData={formData} updateForm={updateForm} onNext={nextStep} onPrev={prevStep} />;
            case ScheduleStep.PREVIEW:
                return <SchedulePreviewStep formData={formData} updateForm={updateForm} onNext={nextStep} onPrev={prevStep} />;
            case ScheduleStep.CONFIRMATION:
                return <ScheduleConfirmationStep formData={formData} onReset={resetFlow} />;
            default:
                return null;
        }
    };

    const steps = [
        { id: ScheduleStep.SELECT_ORDER, label: 'Select Order' },
        { id: ScheduleStep.SHIPPING, label: 'Shipping' },
        { id: ScheduleStep.PREVIEW, label: 'Review' },
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
