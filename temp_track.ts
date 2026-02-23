import { trackShipment } from './src/lib/delhivery';
trackShipment('44324210002903').then(res => console.log(JSON.stringify(res.data, null, 2)));
