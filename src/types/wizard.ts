import { InvoiceItem, GSTTreatment } from './invoice';
import { Warehouse } from './delhivery';

export enum WizardStep {
    CUSTOMER = 1,
    ITEMS = 2,
    SHIPPING = 3,
    PREVIEW = 4,
    CONFIRMATION = 5,
}

// Full state for the combined form
export interface CombinedFormData {
    // --- Step 1: Customer & Invoice Detail ---
    customer_id: string; // If selected from Zoho
    customer_name: string;
    email: string;
    country_code: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    country: string;
    pincode: string;
    date: string;
    due_date: string;
    payment_terms: number;
    reference_number: string;
    gst_treatment: GSTTreatment;
    salesperson_name: string;

    // validation state
    isPincodeServiceable: boolean | null;

    // --- Step 2: Items ---
    invoice_items: InvoiceItem[];
    discount: string;
    discount_type: 'entity_level' | 'item_level';
    adjustment: string;
    adjustment_description: string;
    notes: string;
    terms: string;

    // --- Added for Shipping/COD Charges ---
    include_shipping: boolean;
    include_cod: boolean;

    // --- Step 3: Shipping ---
    warehouse: Warehouse | string;
    shipping_mode: 'Surface' | 'Express';
    payment_mode: 'Prepaid' | 'COD';
    weight: number; // in grams
    length?: number; // cm
    width?: number; // cm
    height?: number; // cm
    fragile: boolean;
    products_desc: string;

    // --- Step 4/5 Generated Info ---
    invoiceId?: string;
    invoiceUrl?: string; // S3 link or Zoho PDF link
    waybill?: string;
    labelUrl?: string; // S3 link for shipping label
    orderId?: string; // Unique reference num generated

    // --- Optional Shipping Overrides ---
    shipping_seller_name?: string;
    shipping_seller_phone?: string;
    shipping_seller_address?: string;
    shipping_item_desc?: string;
    shipping_final_price?: number;
}

export const INITIAL_WIZARD_STATE: CombinedFormData = {
    customer_id: '',
    customer_name: '',
    email: '',
    country_code: '+91',
    phone: '',
    address: '',
    city: '',
    state: 'Delhi',
    country: 'India',
    pincode: '',
    date: '',
    due_date: '',
    payment_terms: 0,
    reference_number: '',
    gst_treatment: 'consumer',
    salesperson_name: '',
    isPincodeServiceable: null,
    invoice_items: [],
    discount: '',
    discount_type: 'entity_level',
    adjustment: '',
    adjustment_description: '',
    notes: 'Thanks for your business.',
    terms: 'Terms and conditions apply.',
    include_shipping: true,
    include_cod: false,
    warehouse: 'ganpati jaipur',
    shipping_mode: 'Surface',
    payment_mode: 'Prepaid',
    weight: 0,
    length: undefined,
    width: undefined,
    height: undefined,
    fragile: false,
    products_desc: '',

    // Optional Shipping Overrides
    shipping_seller_name: '',
    shipping_seller_phone: '',
    shipping_seller_address: '',
    shipping_item_desc: '',
    shipping_final_price: undefined,
};
