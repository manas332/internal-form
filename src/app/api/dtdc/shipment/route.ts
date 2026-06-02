import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const apiKey = process.env.DTDC_API_KEY;

        if (!apiKey) {
            return NextResponse.json({ success: false, error: 'DTDC API Key is not configured' }, { status: 500 });
        }

        const {
            orderId,
            name,
            phone,
            addressLine1,
            addressLine2,
            pincode,
            city,
            state,
            country,
            paymentMode,
            totalAmount,
            codAmount,
            productsDesc,
            weight,
            length,
            width,
            height,
            isFragile,
            shippingMode
        } = body;

        // Ensure weight is converted to KG as expected by the API (if coming as grams, divide by 1000)
        // Adjust the mapping based on how SchedulePreviewStep sends it.
        const weightKg = (weight || 200) / 1000;

        // Default or mapped dimensions
        const l = length || 10;
        const w = width || 10;
        const h = height || 10;

        // Hardcoded values to be filled later by the user
        const customerCode = "";
        const serviceTypeId = "";
        const courierPartner = "";
        const courierAccount = "";
        const hubCode = "";
        
        // Prepare origin details (Can be mapped from warehouse similarly to Delhivery if needed, leaving static for now as per DTDC Export)
        const originName = "DA Dharm Sathi Pvt Ltd";
        const originPhone = "9999999999"; // Replace with actual
        const originAddress = "";
        const originPincode = "";
        const originCity = "";
        const originState = "";
        const originCountry = "India";

        const payload = {
            action_type: "single_pickup",
            consignment_type: "forward",
            movement_type: "forward",
            load_type: "NON-DOCUMENT", // Usually NON-DOCUMENT for physical products
            description: productsDesc || "Spiritual Items",
            customer_code: customerCode,
            reference_number: orderId,
            service_type_id: serviceTypeId,
            cod_favor_of: name,
            cod_collection_mode: "cash", // Or "cheque", "dd"
            dimension_unit: "cm",
            length: String(l),
            width: String(w),
            height: String(h),
            weight_unit: "kg",
            weight: String(weightKg),
            volume_unit: "cm3", // As per standard, volume can be left empty if dimensions are provided, or calculated
            cod_amount: paymentMode === "COD" ? String(codAmount || totalAmount) : "0",
            invoice_amount: String(totalAmount),
            declared_value: totalAmount,
            declared_value_without_tax: totalAmount,
            num_pieces: 1, // Assuming 1 piece for simplicity, can be dynamic
            customer_reference_number: orderId,
            is_risk_surcharge_applicable: false,
            courier_partner: courierPartner,
            courier_account: courierAccount,
            hub_code: hubCode,
            
            origin_details: {
                name: originName,
                phone: originPhone,
                address_line_1: originAddress,
                pincode: originPincode,
                city: originCity,
                state: originState,
                country: originCountry
            },
            destination_details: {
                name: name,
                phone: phone,
                address_line_1: addressLine1,
                address_line_2: addressLine2 || "",
                pincode: pincode,
                city: city,
                state: state,
                country: country || "India"
            },
            pieces_detail: [
                {
                    description: productsDesc || "Spiritual Items",
                    declared_value: String(totalAmount),
                    weight: String(weightKg),
                    height: String(h),
                    length: String(l),
                    width: String(w),
                    weight_unit: "kg",
                    dimension_unit: "cm"
                }
            ]
        };

        const response = await fetch('https://app.shipsy.in/api/customer/integration/consignment/upload/softdata/v2', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            console.error('Shipsy/DTDC API Error:', data);
            return NextResponse.json({ 
                success: false, 
                error: data.error?.message || 'Failed to create DTDC shipment',
                details: data.error
            }, { status: 400 });
        }

        // Return the waybill (reference_number mapped from response)
        return NextResponse.json({ 
            success: true, 
            waybill: data.reference_number || orderId, // If Shipsy uses orderId as the waybill or returns a specific one
            data 
        });

    } catch (error: any) {
        console.error('Error in DTDC shipment creation:', error);
        return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
