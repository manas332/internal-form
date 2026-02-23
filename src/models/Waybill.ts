import mongoose from 'mongoose';

const WaybillSchema = new mongoose.Schema(
    {
        waybill: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['UNUSED', 'USED'],
            default: 'UNUSED',
        },
        orderId: {
            type: String,
            default: null, // Set when assigned to an order
        },
    },
    { timestamps: true }
);

export default mongoose.models.Waybill || mongoose.model('Waybill', WaybillSchema);
