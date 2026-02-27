const fetch = require('node-fetch');

async function testShipmentAPI() {
    const payload = {
        name: "Test Customer",
        order: "TEST-ORDER-123",
        pickup_location: "Baba",
        address: "Test Address, Noida",
        pincode: 201301,
        city: "Noida",
        state: "Uttar Pradesh",
        country: "India",
        phone: "9999999999",
        payment_mode: "Prepaid",
        weight: 500,
        products_desc: "Test items"
    };

    console.log("Testing single shipment payload...");
    const res = await fetch('http://localhost:3000/api/delhivery/shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log("Status:", res.status);
    console.log("Response:", JSON.stringify(data, null, 2));
}

// testShipmentAPI();
console.log("Test script ready. Replace with actual dev server URL if different.");
