import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema(
    {
        zohoInvoiceId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        orderId: {
            type: String,
            required: true,
            unique: true,
        },
        customerDetails: {
            customer_name: String,
            email: String,
            phone: String,
            country_code: String,
            address: String,
            city: String,
            state: String,
            country: String,
            pincode: String,
        },
        invoiceItems: [
            {
                item_id: String,
                name: String,
                quantity: Number,
                rate: Number,
                item_total: Number,
                tax_id: String,
                tax_percentage: Number,
                hsn_or_sac: String,
                carat_size: String,
            }
        ],
        salespersonName: {
            type: String,
            default: '',
        },
        shippingCost: {
            type: Number,
            default: 0,
        },
        invoiceUrl: String,
        status: {
            type: String,
            enum: ['PENDING_SHIPPING', 'SHIPPED'],
            default: 'PENDING_SHIPPING',
        },
        waybill: {
            type: String,
            default: null,
        },
        labelUrl: {
            type: String,
            default: null,
        }
    },
    { timestamps: true }
);

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);
