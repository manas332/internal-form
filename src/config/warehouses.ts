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
    'khambat facility',
    'PRAYOSHA CRYSTALS',
    'K V',
    'Keshav Agate',
    'Surya',
    'Sonipat'
] as const;

export type DelhiveryWarehouse = typeof DELHIIVERY_WAREHOUSES[number];

export interface WarehouseDetail {
    pincode: string;
    description: string;
    defaultPickupTime?: string; // hh:mm:ss
}

export const WAREHOUSE_DETAILS: Record<DelhiveryWarehouse, WarehouseDetail> = {
    'ganpati jaipur': { pincode: '302020', description: 'Jaipur Ganpati' },
    'jaipur 2': { pincode: '302003', description: 'Jaipur 2' },
    'Humara Pandit house': { pincode: '560076', description: 'Bengaluru Pandit House' },
    'Mansuri': { pincode: '388620', description: 'Khambhat Mansuri' },
    'Jaipur gems': { pincode: '302003', description: 'Jaipur Gems' },
    'Office': { pincode: '201318', description: 'Greater Noida Office' },
    'Noida': { pincode: '201318', description: 'Noida' },
    'chd pink city': { pincode: '160023', description: 'Chandigarh Pink City' },
    'Rajan': { pincode: '110024', description: 'Delhi Rajan' },
    'wework': { pincode: '560076', description: 'Bengaluru WeWork' },
    'Varanasi': { pincode: '221001', description: 'Varanasi' },
    'Delhi rudraksh': { pincode: '110008', description: 'Delhi Rudraksh' },
    'Baba': { pincode: '302003', description: 'Jaipur Baba' },
    'khambat facility': { pincode: '388620', description: 'Khambhat Facility' },
    'PRAYOSHA CRYSTALS': { pincode: '388620', description: 'Khambhat Prayosha' },
    'K V': { pincode: '110093', description: 'Delhi K V' },
    'Keshav Agate': { pincode: '388620', description: 'Khambhat Keshav' },
    'Surya': { pincode: '110095', description: 'Delhi Surya' },
    'Sonipat': {
        pincode: '131001',
        description: 'Sonipat Facility',
        defaultPickupTime: '18:00:00'
    }
};
