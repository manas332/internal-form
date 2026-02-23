import { z } from 'zod';

export const customerStepSchema = z.object({
    customer_name: z.string().min(1, 'Customer Name is required'),
    email: z.string().email('Invalid email address').or(z.literal('')), // Optional but must be valid if present
    country_code: z.string().min(1, 'Country Code is required'),
    phone: z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits'),
    address: z.string().min(1, 'Address is required'),
    city: z.string().optional(),
    state: z.string().min(1, 'State is required'),
    pincode: z.string().regex(/^\d{6}$/, 'Pincode must be exactly 6 digits'),
    date: z.string().min(1, 'Invoice Date is required'),
    isPincodeServiceable: z.boolean().default(true).refine((val) => val === true, {
        message: 'Pincode must be serviceable'
    }),
});

export const invoiceItemsStepSchema = z.object({
    invoice_items: z.array(z.object({
        name: z.string().min(1, 'Item name is required'),
        quantity: z.number().min(0.01, 'Quantity must be greater than 0'),
        price: z.number().min(0, 'Rate must be 0 or more'),
        description: z.string().optional(),
        hsn_or_sac: z.string().optional(),
        tax_id: z.string().optional(),
        tax_amount: z.number().optional(),
        item_total: z.number().optional(),
        product_id: z.string().optional(),
        unit: z.string().optional(),
        carat_size: z.number().optional(),
    })).min(1, 'Add at least one item to the invoice'),
});

export const shippingStepSchema = z.object({
    warehouse: z.string().min(1, 'Pickup Location (Warehouse) is required'),
    products_desc: z.string().min(1, 'Package Contents Description is required'),
    weight: z.number().min(1, 'Weight must be strictly greater than 0 grams'),
    length: z.number().optional().refine(val => !val || val > 0, 'Length must be > 0 if provided'),
    width: z.number().optional().refine(val => !val || val > 0, 'Width must be > 0 if provided'),
    height: z.number().optional().refine(val => !val || val > 0, 'Height must be > 0 if provided'),
});
