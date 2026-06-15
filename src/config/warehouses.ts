// List of registered Delhivery pickup locations (warehouses)
// Dynamically loaded from vendors.json to keep it as the single source of truth.
import vendors from '../../vendors.json';

export const DELHIIVERY_WAREHOUSES = vendors.map((v: any) => v.facility_name);

export type DelhiveryWarehouse = string;

export interface WarehouseDetail {
    pincode: string;
    description: string;
    defaultPickupTime?: string; // hh:mm:ss
}

export const WAREHOUSE_DETAILS: Record<string, WarehouseDetail> = {};

vendors.forEach((v: any) => {
    WAREHOUSE_DETAILS[v.facility_name] = {
        pincode: v.pincode,
        description: v.facility_name
    };
});

// Preserve any specific hardcoded overrides that were present before
if (WAREHOUSE_DETAILS['Sonipat']) {
    WAREHOUSE_DETAILS['Sonipat'].defaultPickupTime = '18:00:00';
}
