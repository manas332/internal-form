// List of registered Delhivery pickup locations (warehouses)
// These must match exactly with the names registered in the Delhivery dashboard.

export const DELHIIVERY_WAREHOUSES = [
    'ganpati jaipur',
    'jaipur 2',
    'Humara Pandit house',
    'Mansuri',
    'Jaipur gems',
    'Office',
    'Noida',
    'chd pink city',
    'Rajan',
    'wework',
    'Varanasi',
    'Delhi rudraksh',
    'Baba',
    'khambat facility'
] as const;

export type DelhiveryWarehouse = typeof DELHIIVERY_WAREHOUSES[number];
