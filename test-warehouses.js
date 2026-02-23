const token = 'bf63cf2232064b480e0d4e268db95dfd2c1d84a2';
const baseUrl = 'https://track.delhivery.com';

async function testFetchWarehouses() {
    console.log(`\n--- TESTING FETCH WAREHOUSES ---`);
    
    // Test base clientwarehouse endpoint
    const res = await fetch(`${baseUrl}/api/backend/clientwarehouse/`, {
        method: 'GET',
        headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    const data = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(data);
}

testFetchWarehouses();
