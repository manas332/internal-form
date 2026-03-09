import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function check() {
    await mongoose.connect(process.env.MONGODB_URI as string);
    const orderCollection = mongoose.connection.collection('orders');

    const statuses = await orderCollection.distinct('status');
    console.log('Distinct order statuses:', statuses);

    await mongoose.disconnect();
}

check().catch(console.error);
