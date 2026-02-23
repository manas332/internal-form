require('dotenv').config({ path: '.env.local' });

async function zohoHeaders() {
    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
    });

    const res = await fetch('https://accounts.zoho.in/oauth/v2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    const data = await res.json();
    return {
        Authorization: `Zoho-oauthtoken ${data.access_token}`,
        'X-com-zoho-subscriptions-organizationid': process.env.ZOHO_ORG_ID,
        'Content-Type': 'application/json',
    };
}

async function testFetch() {
    const headers = await zohoHeaders();
    console.log("Got headers.")
    
    // Test items fetch API 
    // Trying the same endpoints as Zoho Books/Inventory
    const res = await fetch('https://www.zohoapis.in/billing/v1/items?per_page=50', {
        method: 'GET',
        headers
    });
    
    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Items count:", data.items ? data.items.length : 'none');
    if (data.items && data.items.length > 0) {
        console.log("Sample item:", data.items[0]);
    } else {
        console.log("Response:", data);
    }
}

testFetch();
