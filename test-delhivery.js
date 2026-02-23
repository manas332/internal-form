const token = 'bf63cf2232064b480e0d4e268db95dfd2c1d84a2';
const baseUrl = 'https://track.delhivery.com';

const pickupPayload = {
  pickup_time: "14:30:00",
  pickup_date: "2026-02-23",
  pickup_location: "Baba",
  expected_package_count: 1
};

async function testPickup() {
    console.log(`\n--- TESTING PICKUP REQ ---`);
    console.dir(pickupPayload);
    
    // The pickup API requires flat URL encoded strings, not JSON wrapped inside a data= property
    const formParams = new URLSearchParams();
    formParams.append('pickup_time', pickupPayload.pickup_time);
    formParams.append('pickup_date', pickupPayload.pickup_date);
    formParams.append('pickup_location', pickupPayload.pickup_location);
    formParams.append('expected_package_count', pickupPayload.expected_package_count);

    const res = await fetch(`${baseUrl}/fm/request/new/`, {
        method: 'POST',
        headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formParams.toString(),
    });
    
    const data = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(data);
}

testPickup();
