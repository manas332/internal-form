// ============================================================
// Zoho Billing API — TypeScript Interfaces (India GST Edition)
// ============================================================

// --- GST Enums ---
export type GSTTreatment =
  | 'business_gst'
  | 'business_none'
  | 'overseas'
  | 'consumer';

// Indian States / Union Territories for place_of_supply
export const INDIAN_STATES = [
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN',
  'GA', 'GJ', 'HP', 'HR', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD',
  'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'PB', 'PY', 'RJ',
  'SK', 'TN', 'TS', 'TR', 'UK', 'UP', 'WB',
] as const;

export const INDIAN_STATE_NAMES: Record<string, string> = {
  AN: 'Andaman and Nicobar Islands',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CG: 'Chhattisgarh',
  CH: 'Chandigarh',
  DD: 'Daman and Diu',
  DL: 'Delhi',
  DN: 'Dadra and Nagar Haveli',
  GA: 'Goa',
  GJ: 'Gujarat',
  HP: 'Himachal Pradesh',
  HR: 'Haryana',
  JH: 'Jharkhand',
  JK: 'Jammu and Kashmir',
  KA: 'Karnataka',
  KL: 'Kerala',
  LA: 'Ladakh',
  LD: 'Lakshadweep',
  MH: 'Maharashtra',
  ML: 'Meghalaya',
  MN: 'Manipur',
  MP: 'Madhya Pradesh',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OD: 'Odisha',
  PB: 'Punjab',
  PY: 'Puducherry',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TN: 'Tamil Nadu',
  TS: 'Telangana',
  TR: 'Tripura',
  UK: 'Uttarakhand',
  UP: 'Uttar Pradesh',
  WB: 'West Bengal',
};

// --- Salesperson ---
export const SALESPERSONS = ['Utkarsh', 'Karamveer', 'Aviral', 'Raj'] as const;
export type Salesperson = (typeof SALESPERSONS)[number];

// --- Address ---
export interface Address {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  fax?: string;
}

// --- Invoice Line Item ---
export interface InvoiceItem {
  /** If selecting an existing Zoho product */
  product_id?: string;
  name: string;
  description?: string;
  quantity: number;
  price: number;
  discount?: number;
  tax_id?: string;
  tax_amount?: number; // UI only
  item_total?: number;
  hsn_or_sac?: string;
  unit?: string;
  carat_size?: number; // optional, 2 decimal places
}

// --- Custom Field ---
export interface CustomField {
  label: string;
  value: string;
}

// --- Create Invoice Request ---
export interface CreateInvoiceRequest {
  customer_id: string;
  date: string; // YYYY-MM-DD
  due_date?: string;
  payment_terms?: number;
  payment_terms_label?: string;
  reference_number?: string;

  // GST (India)
  gst_treatment?: GSTTreatment;
  gst_no?: string;
  place_of_supply?: string;

  // Salesperson
  salesperson_name?: string;

  // Line items
  invoice_items: InvoiceItem[];

  // Discounts
  discount?: number;
  is_discount_before_tax?: boolean;
  discount_type?: 'entity_level' | 'item_level';
  is_inclusive_tax?: boolean;

  // Charges
  shipping_charge?: string;
  adjustment?: number;
  adjustment_description?: string;

  // Additional
  notes?: string;
  terms?: string;
  custom_fields?: CustomField[];
  template_id?: string;
  exchange_rate?: number;
}

// --- Create Invoice Response ---
export interface CreateInvoiceResponse {
  code: number;
  message: string;
  invoice?: {
    invoice_id: string;
    invoice_number: string;
    status: string;
    date: string;
    due_date: string;
    customer_id: string;
    customer_name: string;
    total: number;
    balance: number;
    currency_code: string;
    currency_symbol: string;
    invoice_url: string;
    invoice_items: Array<{
      item_id: string;
      name: string;
      price: string;
      quantity: number;
      item_total: number;
    }>;
  };
}

// --- Customer ---
export interface Customer {
  customer_id: string;
  display_name: string;
  email?: string;
  company_name?: string;
  gst_no?: string;
  gst_treatment?: GSTTreatment;
  place_of_contact?: string;
}

export interface CreateCustomerRequest {
  display_name: string;
  email?: string;
  company_name?: string;
  gst_no?: string;
  gst_treatment?: GSTTreatment;
  place_of_contact?: string;
  billing_address?: Address;
}

// --- Form State ---
export interface InvoiceFormData {
  customer_id: string;
  customer_name: string;
  date: string;
  due_date: string;
  payment_terms: number;
  reference_number: string;
  gst_treatment: GSTTreatment;
  gst_no: string;
  place_of_supply: string;
  salesperson_name: string;
  invoice_items: InvoiceItem[];
  notes: string;
  terms: string;
  shipping_charge: string;
  adjustment: string;
  adjustment_description: string;
  discount: string;
  discount_type: 'entity_level' | 'item_level';
}
