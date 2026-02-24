'use client';

import { useState } from 'react';
import { CombinedFormData, INITIAL_WIZARD_STATE, WizardStep } from '@/types/wizard';
import CustomerStep from './steps/CustomerStep';
import InvoiceItemsStep from './steps/InvoiceItemsStep';
import OrderPreviewStep from './steps/OrderPreviewStep';
import OrderConfirmationStep from './steps/OrderConfirmationStep';

export default function CreateOrderFlow() {
    const [currentStep, setCurrentStep] = useState<WizardStep>(WizardStep.CUSTOMER);
    const [formData, setFormData] = useState<CombinedFormData>(INITIAL_WIZARD_STATE);

    const updateForm = (updates: Partial<CombinedFormData>) => {
        setFormData((prev) => ({ ...prev, ...updates }));
    };

    // The steps for Create Order flow don't include shipping
    // CUSTOMER = 1, ITEMS = 2, PREVIEW = 4 (we just skip 3), CONFIRMATION = 5
    const getNextStepId = (curr: WizardStep) => {
        if (curr === WizardStep.CUSTOMER) return WizardStep.ITEMS;
        if (curr === WizardStep.ITEMS) return WizardStep.PREVIEW;
        if (curr === WizardStep.PREVIEW) return WizardStep.CONFIRMATION;
        return curr;
    };

    const getPrevStepId = (curr: WizardStep) => {
        if (curr === WizardStep.ITEMS) return WizardStep.CUSTOMER;
        if (curr === WizardStep.PREVIEW) return WizardStep.ITEMS;
        return curr;
    };

    const nextStep = () => setCurrentStep(getNextStepId);
    const prevStep = () => setCurrentStep(getPrevStepId);

    const renderStep = () => {
        switch (currentStep) {
            case WizardStep.CUSTOMER:
                return <CustomerStep formData={formData} updateForm={updateForm} onNext={nextStep} />;
            case WizardStep.ITEMS:
                return <InvoiceItemsStep formData={formData} updateForm={updateForm} onNext={nextStep} onPrev={prevStep} />;
            case WizardStep.PREVIEW:
                return <OrderPreviewStep formData={formData} updateForm={updateForm} onNext={nextStep} onPrev={prevStep} />;
            case WizardStep.CONFIRMATION:
                return <OrderConfirmationStep formData={formData} onReset={() => {
                    setFormData(INITIAL_WIZARD_STATE);
                    setCurrentStep(WizardStep.CUSTOMER);
                }} />;
            default:
                return null;
        }
    };

    const steps = [
        { id: WizardStep.CUSTOMER, label: 'Customer' },
        { id: WizardStep.ITEMS, label: 'Items' },
        { id: WizardStep.PREVIEW, label: 'Review' },
        { id: WizardStep.CONFIRMATION, label: 'Complete' },
    ];

    return (
        <div className="wizard-container">
            {/* Stepper Header */}
            <div className="wizard-stepper">
                {steps.map((step, idx) => {
                    // We map the actual enum WizardStep to its position in the array
                    const isCompleted = currentStep > step.id || (currentStep === WizardStep.CONFIRMATION && step.id === WizardStep.PREVIEW);
                    const isActive = currentStep === step.id;

                    return (
                        <div key={step.id} className="stepper-item-wrapper">
                            <div
                                className={`stepper-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''
                                    }`}
                            >
                                <div className="stepper-circle">
                                    {isCompleted ? (
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
                                <div className={`stepper-line ${isCompleted ? 'completed' : ''}`} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Step Content */}
            <div className="wizard-content">
                {renderStep()}
            </div>
        </div>
    );
}
