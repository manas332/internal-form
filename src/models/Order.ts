import mongoose from 'mongoose';
import { SHIPPING_PROVIDERS } from '../config/providers';

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
        astrologerDetails: {
            astrologerName: String,
            astrologerNumber: String,
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
                tax_amount: Number,
                final_price: Number,
                hsn_or_sac: String,
                carat_size: String,
                cost_price: {
                    type: Number,
                    required: true,
                },
            }
        ],
        /**
         * Final invoice total as calculated by Zoho (includes entity-level discounts,
         * shipping/COD charge line items, and taxes as configured).
         *
         * This is used for accurate revenue reporting because invoice-level discounts
         * are not reflected in individual line item totals.
         */
        invoiceTotal: {
            type: Number,
            default: null,
        },
        salespersonName: {
            type: String,
            default: '',
        },
        paymentMode: {
            type: String,
            enum: ['Prepaid', 'COD'],
            default: 'Prepaid',
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
                vendor: String, // Maps to Warehouse/Origin from vendors.json
                deliveryPartner: {
                    type: String,
                    enum: ['Delhivery', 'DTDC', 'SELF'],
                    default: 'Delhivery'
                },
                waybill: String, // optional for self-shipped / DTDC
                shippingCost: {
                    type: Number,
                    default: 0,
                },
                warehouse: String,
                paymentMode: {
                    type: String,
                    enum: ['Prepaid', 'COD'],
                    default: 'Prepaid',
                },
                codAmount: {
                    type: Number,
                    default: null,
                },
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
            enum: ['PENDING_SHIPPING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'SELF_SHIPPED', 'DTDC_SCHEDULED', 'RTO'],
            default: 'PENDING_SHIPPING',
        },
        selfShipped: {
            type: Boolean,
            default: false,
        },
        selfShipmentStatus: {
            type: String,
            enum: ['Order Created', 'Order shipped', 'Order Completed'],
            default: 'Order Created',
        },
        selfShipmentNotes: {
            type: String,
            default: '',
            maxlength: 500,
        },
        selfShipmentProvider: {
            type: String,
            enum: [...SHIPPING_PROVIDERS, ''],
            default: '',
        },
        selfShipmentAWB: {
            type: String,
            default: '',
        },
        invoiceUrl: String,
    },
    { timestamps: true }
);

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);