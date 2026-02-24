// ============================================================
// Zoho Billing API — Server-side OAuth2 + API Helpers (India)
// ============================================================

const ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.in';
const ZOHO_API_BASE = 'https://www.zohoapis.in/billing/v1';

// --- Token Cache ---
let cachedToken: { access_token: string; expires_at: number } | null = null;

/**
 * Get a valid access token, refreshing if expired.
 */
export async function getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (cachedToken && Date.now() < cachedToken.expires_at - 60_000) {
        return cachedToken.access_token;
    }

    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Missing Zoho OAuth credentials in environment variables');
    }

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    });

    const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to refresh Zoho token: ${res.status} — ${text}`);
    }

    const data = await res.json();

    if (data.error) {
        throw new Error(`Zoho OAuth error: ${data.error}`);
    }

    cachedToken = {
        access_token: data.access_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    };

    return cachedToken.access_token;
}

/**
 * Common headers for Zoho API requests.
 */
async function zohoHeaders(): Promise<Record<string, string>> {
    const token = await getAccessToken();
    const orgId = process.env.ZOHO_ORG_ID;

    if (!orgId) {
        throw new Error('Missing ZOHO_ORG_ID in environment variables');
    }

    return {
        Authorization: `Zoho-oauthtoken ${token}`,
        'X-com-zoho-subscriptions-organizationid': orgId,
        'Content-Type': 'application/json',
    };
}

// ============================================================
// INVOICES
// ============================================================

/**
 * Create an invoice via Zoho Billing API.
 */
export async function createInvoice(body: Record<string, unknown>) {
    const headers = await zohoHeaders();

    const res = await fetch(`${ZOHO_API_BASE}/invoices`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    const data = await res.json();
    return { status: res.status, data };
}

/**
 * Fetch invoice PDF as an ArrayBuffer.
 */
export async function getInvoicePdf(invoiceId: string): Promise<ArrayBuffer> {
    const headers = await zohoHeaders();
    // Override accept & content-type for PDF
    delete headers['Content-Type'];
    headers['Accept'] = 'application/pdf';


    const res = await fetch(
        `${ZOHO_API_BASE}/invoices/${invoiceId}?accept=pdf`,
        { method: 'GET', headers }
    );



    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch invoice PDF: ${res.status} — ${text}`);
    }

    const contentType = res.headers.get('content-type') || '';

    // If Zoho returned JSON instead of PDF, it's an error response
    if (contentType.includes('application/json')) {
        const data = await res.json();
        throw new Error(`Zoho returned error instead of PDF: ${data.message || JSON.stringify(data)}`);
    }

    return res.arrayBuffer();
}

// ============================================================
// CUSTOMERS
// ============================================================

/**
 * Search customers by display_name.
 */
export async function searchCustomers(query: string) {
    const headers = await zohoHeaders();

    const params = new URLSearchParams({
        display_name_contains: query,
        per_page: '10',
    });

    const res = await fetch(
        `${ZOHO_API_BASE}/customers?${params.toString()}`,
        { method: 'GET', headers }
    );

    const data = await res.json();
    return { status: res.status, data };
}

/**
 * Get full customer details by ID.
 */
export async function getCustomer(customerId: string) {
    const headers = await zohoHeaders();

    const res = await fetch(`${ZOHO_API_BASE}/customers/${customerId}`, {
        method: 'GET',
        headers,
    });

    const data = await res.json();
    return { status: res.status, data };
}

/**
 * Create a new customer.
 */
export async function createCustomer(body: Record<string, unknown>) {
    const headers = await zohoHeaders();

    const res = await fetch(`${ZOHO_API_BASE}/customers`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    const data = await res.json();
    return { status: res.status, data };
}

// ============================================================
// ITEMS
// ============================================================

/**
 * Fetch all active items from Zoho Billing.
 */
export async function fetchItems() {
    const headers = await zohoHeaders();

    const params = new URLSearchParams({
        status: 'active',
        // Fetch up to 200 items to power the dropdown
        per_page: '200',
    });

    const res = await fetch(`${ZOHO_API_BASE}/items?${params.toString()}`, {
        method: 'GET',
        headers,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch items from Zoho: ${res.status} — ${text}`);
    }

    const data = await res.json();
    return { status: res.status, data: data.items || [] };
}

// ============================================================
// TAXES
// ============================================================

/**
 * Fetch all taxes from Zoho Billing.
 */
export async function fetchTaxes() {
    const headers = await zohoHeaders();

    const res = await fetch(`${ZOHO_API_BASE}/settings/taxes`, {
        method: 'GET',
        headers,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch taxes from Zoho: ${res.status} — ${text}`);
    }

    const data = await res.json();
    return { status: res.status, data: data.taxes || [] };
}

// ============================================================
// SETTINGS
// ============================================================

/**
 * Fetch default invoice settings (notes, terms, etc.) from Zoho Billing.
 */
export async function fetchInvoiceSettings() {
    const headers = await zohoHeaders();

    const res = await fetch(`${ZOHO_API_BASE}/invoices/editpage`, {
        method: 'GET',
        headers,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch invoice settings from Zoho: ${res.status} — ${text}`);
    }

    const data = await res.json();
    return { status: res.status, data: data.invoice_settings || {} };
}
