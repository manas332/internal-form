'use client';

import { useState } from 'react';
import { CombinedFormData, INITIAL_WIZARD_STATE, WizardStep } from '@/types/wizard';
import CustomerStep from './steps/CustomerStep';
import InvoiceItemsStep from './steps/InvoiceItemsStep';
import ShippingStep from './steps/ShippingStep';
import PreviewStep from './steps/PreviewStep';
import ConfirmationStep from './steps/ConfirmationStep';

export default function CombinedWizard() {
    const [currentStep, setCurrentStep] = useState<WizardStep>(WizardStep.CUSTOMER);
    const [formData, setFormData] = useState<CombinedFormData>(INITIAL_WIZARD_STATE);

    const updateForm = (updates: Partial<CombinedFormData>) => {
        setFormData((prev) => ({ ...prev, ...updates }));
    };

    const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 5) as WizardStep);
    const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1) as WizardStep);

    const renderStep = () => {
        switch (currentStep) {
            case WizardStep.CUSTOMER:
                return <CustomerStep formData={formData} updateForm={updateForm} onNext={nextStep} />;
            case WizardStep.ITEMS:
                return <InvoiceItemsStep formData={formData} updateForm={updateForm} onNext={nextStep} onPrev={prevStep} />;
            case WizardStep.SHIPPING:
                return <ShippingStep formData={formData} updateForm={updateForm} onNext={nextStep} onPrev={prevStep} />;
            case WizardStep.PREVIEW:
                return <PreviewStep formData={formData} updateForm={updateForm} onNext={nextStep} onPrev={prevStep} />;
            case WizardStep.CONFIRMATION:
                return <ConfirmationStep formData={formData} onReset={() => {
                    setFormData(INITIAL_WIZARD_STATE);
                    setCurrentStep(WizardStep.CUSTOMER);
                }} />;
            default:
                return null;
        }
    };

    const steps = [
        { id: 1, label: 'Customer' },
        { id: 2, label: 'Items' },
        { id: 3, label: 'Shipping' },
        { id: 4, label: 'Preview' },
        { id: 5, label: 'Complete' },
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
                                    step.id
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
