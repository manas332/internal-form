const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const tokenMatch = env.match(/DELHIVERY_API_TOKEN=(.*)/);
if (!tokenMatch) {
  console.error('No token found');
  process.exit(1);
}
const token = tokenMatch[1].trim();

console.log('Testing Delhivery Tracking APIs...');

async function test() {
  console.log('--- PROD ---');
  try {
    const res = await fetch('https://track.delhivery.com/api/v1/packages/json/?ref_ids=272066715', {
      headers: { Authorization: 'Token ' + token }
    });
    console.log('Status PROD:', res.status);
    const text = await res.text();
    console.log('Text PROD:', text.substring(0, 300));
  } catch(e) { console.error(e) }

  console.log('\n--- STAGING ---');
  try {
    const res = await fetch('https://staging-express.delhivery.com/api/v1/packages/json/?ref_ids=272066715', {
      headers: { Authorization: 'Token ' + token }
    });
    console.log('Status STAGING:', res.status);
    const text = await res.text();
    console.log('Text STAGING:', text.substring(0, 300));
  } catch(e) { console.error(e) }
}
test();
