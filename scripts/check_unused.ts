import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const waybillCollection = mongoose.connection.collection('waybills');
    const orderCollection = mongoose.connection.collection('orders');

    const unusedWaybills = await waybillCollection.countDocuments({ status: 'UNUSED' });
    const unusedOrders = await orderCollection.countDocuments({ status: 'UNUSED' });
    const allWaybills = await waybillCollection.countDocuments();
    const allOrders = await orderCollection.countDocuments();

    let out = `Waybills collection: ${unusedWaybills} UNUSED out of ${allWaybills} total\n`;
    out += `Orders collection: ${unusedOrders} UNUSED out of ${allOrders} total\n`;

    const sampleUnusedWaybill = await waybillCollection.findOne({ status: 'UNUSED' });
    out += `Sample Unused Waybill: ${JSON.stringify(sampleUnusedWaybill, null, 2)}\n`;

    const sampleUnusedOrder = await orderCollection.findOne({ status: 'UNUSED' });
    out += `Sample Unused Order: ${JSON.stringify(sampleUnusedOrder, null, 2)}\n`;

    fs.writeFileSync('check_result.txt', out);
    await mongoose.disconnect();
}

check().catch(console.error);
