import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function cleanUnusedWaybills() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);
        console.log('Connected to MongoDB');

        const waybillCollection = mongoose.connection.collection('waybills');

        // Check how many unused waybills exist
        const unusedCount = await waybillCollection.countDocuments({ status: 'UNUSED' });
        console.log(`Found ${unusedCount} unused waybills in MongoDB 'waybills' collection.`);

        if (unusedCount > 0) {
            console.log('Deleting unused waybills from MongoDB...');
            const result = await waybillCollection.deleteMany({ status: 'UNUSED' });
            console.log(`Successfully deleted ${result.deletedCount} unused waybills from MongoDB database.`);
        } else {
            console.log('No unused waybills found in MongoDB.');
        }

        console.log("\n==========================================================");
        console.log("NOTE ON LOCAL BROWSER STORAGE:");
        console.log("If you still see unused waybills on the Tracking Dashboard");
        console.log("under 'Your Recent Shipments (Local Device)', it is because");
        console.log("waybills are saved to the browser's local storage before");
        console.log("order creation is complete.");
        console.log("\nTo clear them from the Tracking Dashboard, open your");
        console.log("browser's Developer Tools (F12) on the tracking page,");
        console.log("go to the 'Console' tab, paste this and press Enter:");
        console.log("localStorage.removeItem('delhivery_recent_orders'); location.reload();");
        console.log("==========================================================\n");

        await mongoose.disconnect();
        console.log('Database connection closed.');

    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
}

cleanUnusedWaybills();
