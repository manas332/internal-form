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
        // Snapshot of invoice line items as created in Zoho / our UI.
        invoiceItems: [
            {
                item_id: String,
                name: String,
                description: String,
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
        // Legacy single-shipment fields kept for backwards compatibility.
        shippingCost: {
            type: Number,
            default: 0,
        },
        waybill: {
            type: String,
            default: null,
        },
        labelUrl: {
            type: String,
            default: null,
        },
        // New: granular shipment records (self-shipped and carrier).
        shipments: [
            {
                vendor: String, // e.g. 'SELF' or a Delhivery vendor/seller name
                waybill: String, // optional for self-shipped
                shippingCost: {
                    type: Number,
                    default: 0,
                },
                warehouse: String,
                items: [
                    {
                        lineIndex: Number, // index into invoiceItems[]
                        quantity: Number,
                    },
                ],
                createdAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        // High-level order shipping status.
        status: {
            type: String,
            enum: ['PENDING_SHIPPING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'SELF_SHIPPED'],
            default: 'PENDING_SHIPPING',
        },
        selfShipped: {
            type: Boolean,
            default: false,
        },
        invoiceUrl: String,
    },
    { timestamps: true }
);

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);
