// ============================================================
// Delhivery API — Server-side API Helpers
// ============================================================
import {
    ShipmentData,
    ShippingCostParams,
    PickupRequestData
} from '@/types/delhivery';

export function getDelhiveryToken(): string {
    const token = process.env.DELHIVERY_API_TOKEN;
    if (!token) {
        throw new Error('Missing DELHIVERY_API_TOKEN in environment variables');
    }
    return token;
}

export function getBaseUrl(isTracking = false): string {
    const env = process.env.DELHIVERY_ENV || 'staging';
    if (isTracking) {
        return 'https://track.delhivery.com';
    }
    return env === 'production'
        ? 'https://track.delhivery.com'
        : 'https://staging-express.delhivery.com';
}

function delhiveryHeaders(additionalHeaders: Record<string, string> = {}) {
    return {
        Authorization: `Token ${getDelhiveryToken()}`,
        'Content-Type': 'application/json',
        ...additionalHeaders,
    };
}

// 1. Pincode Serviceability
export async function checkPincodeServiceability(pincode: string) {
    // Force using the track.delhivery.com endpoint because staging often returns 401 Unauthorized
    const domain = 'https://track.delhivery.com';
    const res = await fetch(`${domain}/c/api/pin-codes/json/?filter_codes=${pincode}`, {
        method: 'GET',
        headers: { Authorization: `Token ${getDelhiveryToken()}` },
        // Docs say only Authorization header is required, not Content-Type
    });
    if (!res.ok) throw new Error(`Delhivery API Error: ${res.status}`);
    return res.json();
}

// 2. Expected TAT
export async function getExpectedTAT(origin: string, dest: string, mot: 'S' | 'E' | 'N', pickupDate?: string) {
    // Force using the track.delhivery.com endpoint because staging often returns 403
    const baseUrl = 'https://track.delhivery.com';
    const url = new URL(`${baseUrl}/api/dc/expected_tat`);
    url.searchParams.append('origin_pin', origin);
    url.searchParams.append('destination_pin', dest);
    url.searchParams.append('mot', mot);
    url.searchParams.append('pdt', 'B2C');
    if (pickupDate) url.searchParams.append('expected_pickup_date', pickupDate);

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            Authorization: `Token ${getDelhiveryToken()}`,
            'Content-Type': 'application/json'
        },
    });
    if (!res.ok) throw new Error(`Delhivery API Error: ${res.status}`);
    return res.json();
}

// 3. Shipping Cost
export async function calculateShippingCost(params: ShippingCostParams) {
    // Force using the track.delhivery.com endpoint because staging often returns HTML errors
    const baseUrl = 'https://track.delhivery.com';
    const url = new URL(`${baseUrl}/api/kinko/v1/invoice/charges/.json`);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
            url.searchParams.append(key, String(value));
        }
    });

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: delhiveryHeaders(),
    });
    // Note: Cost API might return 400 for bad input but still provide JSON
    const data = await res.json();
    return { status: res.status, data };
}

// 4. Shipment Creation
export async function createShipment(shipment: ShipmentData, pickupLocation: string) {
    const baseUrl = getBaseUrl();

    const payload = {
        pickup_location: { name: pickupLocation },
        shipments: [shipment],
    };

    const payloadString = `format=json&data=${encodeURIComponent(JSON.stringify(payload))}`;

    console.log("SENDING TO DELHIVERY:", payloadString);
    console.dir(payload, { depth: null });

    const res = await fetch(`${baseUrl}/api/cmu/create.json`, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            Authorization: `Token ${getDelhiveryToken()}`,
            'Content-Type': 'application/x-www-form-urlencoded' // Changed to x-www-form-urlencoded
        },
        body: payloadString,
    });

    const data = await res.json();
    return { status: res.status, data };
}

// 5. Generate Shipping Label
export async function generateShippingLabel(waybill: string, pdfSize: string = 'A4') {
    const baseUrl = getBaseUrl();
    const url = new URL(`${baseUrl}/api/p/packing_slip`);
    url.searchParams.append('wbns', waybill);
    url.searchParams.append('pdf', 'true');
    url.searchParams.append('pdf_size', pdfSize);

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: delhiveryHeaders(),
    });

    const data = await res.json();
    return { status: res.status, data };
}

// 6. Pickup Request
export async function createPickupRequest(data: PickupRequestData) {
    // Use track.delhivery.com for prod, staging-express.delhivery.com for staging
    // BUT the endpoint is /fm/request/new/
    const baseUrl = getBaseUrl(true);

    const formParams = new URLSearchParams();
    formParams.append('pickup_time', data.pickup_time);
    formParams.append('pickup_date', data.pickup_date);
    formParams.append('pickup_location', data.pickup_location);
    formParams.append('expected_package_count', String(data.expected_package_count));

    const res = await fetch(`${baseUrl}/fm/request/new/`, {
        method: 'POST',
        headers: {
            Authorization: `Token ${getDelhiveryToken()}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formParams.toString(),
    });

    const responseData = await res.json();
    return { status: res.status, data: responseData };
}

// 7. Tracking
export async function trackShipment(waybill?: string, refId?: string) {
    const baseUrl = getBaseUrl(true);
    const url = new URL(`${baseUrl}/api/v1/packages/json/`);
    if (waybill) url.searchParams.append('waybill', waybill);
    if (refId) url.searchParams.append('ref_ids', refId);

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: delhiveryHeaders(),
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error(`Delhivery API returned invalid JSON (Status ${res.status}): ${text}`);
    }

    return { status: res.status, data };
}

// 8. Fetch Bulk Waybills
export async function fetchBulkWaybills(count: number = 10) {
    // Force using the track.delhivery.com endpoint because staging often returns "Unable to fetch client name"
    const domain = 'https://track.delhivery.com';

    const url = new URL(`${domain}/waybill/api/bulk/json/`);
    url.searchParams.append('count', String(count));
    // The docs specify ?token=xxx
    url.searchParams.append('token', getDelhiveryToken());

    const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            // Also add standard authorization header just in case
            'Authorization': `Token ${getDelhiveryToken()}`,
            'Content-Type': 'application/json'
        },
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error(`Delhivery Bulk Waybill API returned invalid JSON (Status ${res.status}): ${text}`);
    }

    return { status: res.status, data };
}
