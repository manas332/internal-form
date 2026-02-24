// ============================================================
// Delhivery API — TypeScript Interfaces
// ============================================================

import { DelhiveryWarehouse } from '../config/warehouses';

export type Warehouse = DelhiveryWarehouse;

// --- Pincode Serviceability ---
export interface PincodeCheckResponse {
  delivery_codes: Array<{
    postal_code: {
      pin: number;
      pre_paid: string; // "Y" or "N"
      cash: string;     // "Y" or "N"
      pickup: string;   // "Y" or "N"
      repl: string;     // "Y" or "N"
      cod: string;      // "Y" or "N"
      is_oda: string;
      sort_code: string;
      state: string;
      city: string;
    };
  }>;
}

// --- Expected TAT ---
export interface ExpectedTATResponse {
  status: number;
  expected_delivery_date?: string; // e.g., "2024-06-03 23:59:00"
  promised_delivery_date?: string;
  error?: string;
}

// --- Shipping Cost ---
export interface ShippingCostParams {
  md: 'E' | 'S'; // Express / Surface
  cgm: number; // Chargeable weight in Grams
  o_pin: number; // Origin Pincode
  d_pin: number; // Destination Pincode
  ss: 'Delivered' | 'RTO' | 'DTO'; // Status of shipment
  pt: 'Pre-paid' | 'COD'; // Payment Type
  l?: number;
  b?: number;
  h?: number;
  ipkg_type?: string;
}

// --- Shipment Creation ---
export interface ShipmentData {
  name: string;
  order: string;
  phone: string; // The doc says 'phonelist', but it takes a string like "9876543210"
  add: string;
  pin: number; // Docs say: Pincode of the consignee (integer)
  address_type?: 'home' | 'office' | '';
  shipping_mode: 'Surface' | 'Express';
  payment_mode: 'Prepaid' | 'COD' | 'Pickup';
  city: string;
  state: string;
  country: string;
  weight: number; // grams
  shipment_height?: number; // cm
  shipment_width?: number; // cm
  shipment_length?: number; // cm
  cod_amount?: number;
  products_desc?: string;
  total_amount: number;
  quantity?: string;
  fragile_shipment?: string;
  return_name?: string;
  return_add?: string;
  return_pin?: number;
  return_city?: string;
  return_state?: string;
  return_country?: string;
  return_phone?: string;
  seller_name?: string;
  seller_add?: string;
  seller_inv?: string;
}

export interface ShipmentPayload {
  shipments: ShipmentData[];
  pickup_location: {
    name: string;
  };
}

export interface ShipmentCreationResponse {
  success: boolean;
  packages: Array<{
    status: string;
    client: string;
    sort_code: string;
    waybill: string;
    cod_amount: number;
    payment: string;
    serviceable: boolean;
    refnum: string; // This is the Order ID
  }>;
  rmq?: string;
  error?: string[] | Record<string, string[]>;
}

// --- Generate Shipping Label ---
export interface ShippingLabelResponse {
  packages_found: number;
  packages: Array<{
    pdf_download_link: string;
    waybill: string;
    status: string;
  }>;
}

// --- Pickup Request ---
export interface PickupRequestData {
  pickup_time: string; // hh:mm:ss
  pickup_date: string; // YYYY-MM-DD
  pickup_location: string;
  expected_package_count: number;
}

export interface PickupRequestResponse {
  pickup_id?: string;
  pr_exist?: boolean;
  incoming_center?: string;
  error?: string;
}

// --- Tracking ---
export interface TrackingScan {
  ScanDateTime: string;
  ScanType: string;
  Scan: string;
  StatusDateTime: string;
  ScannedLocation: string;
  Instructions: string;
  StatusCode: string;
}

export interface TrackingScanWrapper {
  ScanDetail: TrackingScan;
}

export interface TrackingShipmentData {
  Shipment: {
    PickUpDate: string;
    Destination: string;
    DestRecieveDate: string;
    POD: string;
    OrderType: string;
    OutDestinationDate: string;
    ReturnedDate: string;
    ExpectedDeliveryDate: string;
    AWB: string;
    DispatchCount: number;
    InvoiceAmount: number;
    Origin: string;
    OriginRecieveDate: string;
    Carrier: string;
    ReferenceNo: string; // Order ID
    Consignee: {
      City: string;
      Name: string;
      Country: string;
      Address1: string;
      Address2: string;
      Address3: string;
      PinCode: number;
      State: string;
      Telephone1: string;
      Telephone2: string;
    };
    CurrentStatus?: {
      Status: string;
      StatusDateTime: string;
      StatusLocation: string;
      StatusType: string;
    };
    Status?: {
      Status: string;
      StatusDateTime: string;
      StatusLocation: string;
      StatusType: string;
      Instructions?: string;
    };
    Scans: TrackingScanWrapper[] | TrackingScan[];
  };
}

export interface TrackingResponse {
  ShipmentData: TrackingShipmentData[];
}
