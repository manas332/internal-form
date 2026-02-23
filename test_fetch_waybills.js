const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/waybills/fetch?count=10',
  method: 'GET',
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let rawData = '';
  res.on('data', (chunk) => {
    rawData += chunk;
  });
  res.on('end', () => {
    try {
      const parsedData = JSON.parse(rawData);
      console.log('Response:', JSON.stringify(parsedData, null, 2));
    } catch (e) {
      console.log('Raw text:', rawData);
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
