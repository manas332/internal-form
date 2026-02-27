import { InvoiceItem, ZohoTax } from '@/types/invoice';

// ============================================================
// GST Tax Selection — Simple HSN + Inter/Intra Map
// ============================================================

// Single source of truth for our registered GST state
export const BUSINESS_STATE_NAME = 'Haryana';

const BUSINESS_STATE_CODES = ['HR', '06', 'HARYANA'];

const normalizeState = (value: string | undefined | null): string => {
    return (value || '').trim().toUpperCase();
};

export const isSameStateAsBusiness = (value: string | undefined | null): boolean => {
    const norm = normalizeState(value);
    if (!norm) return false;
    if (BUSINESS_STATE_CODES.includes(norm)) return true;
    return norm === BUSINESS_STATE_NAME.toUpperCase();
};

/**
 * Determine if an order should be treated as interstate.
 * Accepts either a full state name (e.g. "Haryana") or state code ("HR", "06").
 */
export const isInterstateOrder = (customerStateOrCode: string | undefined | null): boolean => {
    if (!customerStateOrCode) return true; // safest default — stricter tax (IGST) for unknown
    return !isSameStateAsBusiness(customerStateOrCode);
};

// ============================================================
// THE MAP  —  HSN → { inter tax_id, intra tax_id }
// This is the ONLY source of truth for tax selection.
// ============================================================

export interface HsnTaxIds {
    inter: string; // interstate (IGST) Zoho tax_id
    intra: string; // intrastate (CGST+SGST group) Zoho tax_id
}

/**
 * Every HSN/SAC code maps to exactly one inter and one intra Zoho tax ID.
 * 0% items use the special 'NO_TAX' sentinel.
 */
export const HSN_TAX_IDS: Record<string, HsnTaxIds> = {
    // 0% — Rudrakshas
    '14049070': { inter: 'NO_TAX', intra: 'NO_TAX' },
    // 0.25% — Gemstones and Raw Crystals
    '05080010': { inter: '3355221000000032572', intra: '3355221000000044472' },
    // 3% — Bracelets, Malas and Decorative Items
    '71179090': { inter: '3355221000000032756', intra: '3355221000000044134' },
    // 18% — Vastu Metal
    '83062990': { inter: '3355221000000032375', intra: '3355221000000032451' },
    // 18% — Vastu Copper/Brass
    '74198090': { inter: '3355221000000032375', intra: '3355221000000032451' },
    // 3% — Vastu Wooden (miscellaneous)
    '44209090': { inter: '3355221000000032756', intra: '3355221000000044134' },
    // 3% — Miscellaneous Goods
    '39269090': { inter: '3355221000000032756', intra: '3355221000000044134' },
    // 0% — Poojas and Services
    '999591': { inter: 'NO_TAX', intra: 'NO_TAX' },
    // 0% — Miscellaneous Services
    '999799': { inter: 'NO_TAX', intra: 'NO_TAX' },
};

// HSN → tax rate percentage (for display / reverse-calculation)
export const HSN_TAX_RATES: Record<string, number> = {
    '14049070': 0,
    '05080010': 0.25,
    '71179090': 3,
    '83062990': 18,
    '74198090': 18,
    '44209090': 3,
    '39269090': 3,
    '999591': 0,
    '999799': 0,
};

// 18% tax IDs used for shipping/COD charge line items
export const TAX_18_INTER = '3355221000000032375'; // IGST18
export const TAX_18_INTRA = '3355221000000032451'; // GST18

// ============================================================
// getCorrectTaxId  —  the ONE function everyone calls
// ============================================================

/**
 * Given an HSN code and inter/intra flag, returns the correct Zoho tax_id.
 * Returns 'NO_TAX' for 0% categories or unknown HSN codes.
 */
export const getCorrectTaxId = (hsn: string, isInterstate: boolean): string => {
    const entry = HSN_TAX_IDS[hsn];
    if (!entry) return 'NO_TAX';
    return isInterstate ? entry.inter : entry.intra;
};

/**
 * Returns the correct 18% tax_id for shipping/COD charges.
 */
export const get18PctTaxId = (isInterstate: boolean): string => {
    return isInterstate ? TAX_18_INTER : TAX_18_INTRA;
};

// ============================================================
// normalizeItemTaxForContext  —  auto-correct tax on items
// ============================================================

interface NormalizeContext {
    item: InvoiceItem;
    updates: Partial<InvoiceItem>;
    taxes: ZohoTax[]; // kept for backward compat but not used for selection
    isInterstate: boolean;
}

/**
 * Auto-correct the tax_id on a line item based on its HSN and inter/intra state.
 * Uses the HSN_TAX_IDS map as the single source of truth.
 */
export const normalizeItemTaxForContext = ({
    item,
    updates,
    taxes,
    isInterstate,
}: NormalizeContext): Partial<InvoiceItem> => {
    // Don't touch system/service lines
    if (item.zoho_item_id === '__system__') {
        return updates;
    }

    const merged: InvoiceItem = { ...item, ...updates };
    const hsn = merged.hsn_or_sac || '';

    // If HSN is not in our map, leave tax as-is
    if (!HSN_TAX_IDS[hsn]) {
        return updates;
    }

    const correctTaxId = getCorrectTaxId(hsn, isInterstate);

    // Already correct — no change needed
    if (merged.tax_id === correctTaxId) {
        return {
            ...updates,
            tax_auto_corrected: false,
            tax_correction_note: undefined,
        };
    }

    // Needs correction
    let note: string | undefined;
    if (merged.tax_id && merged.tax_id !== 'NO_TAX' && merged.tax_id !== correctTaxId) {
        note = !isInterstate
            ? 'Switched to CGST+SGST (intrastate transaction).'
            : 'Switched to IGST (interstate transaction).';
    }

    return {
        ...updates,
        tax_id: correctTaxId,
        tax_auto_corrected: !!note,
        tax_correction_note: note,
    };
};

// ============================================================
// validateTaxesForOrder  —  final safety check
// ============================================================

export interface TaxValidationIssue {
    index: number;
    message: string;
}

/**
 * Validate that every line item with an HSN has the correct tax_id
 * from the map. Returns issues for any mismatches.
 */
export const validateTaxesForOrder = (
    items: InvoiceItem[],
    _taxes: ZohoTax[],
    isInterstate: boolean
): TaxValidationIssue[] => {
    const issues: TaxValidationIssue[] = [];

    items.forEach((item, index) => {
        const hsn = item.hsn_or_sac || '';
        if (!HSN_TAX_IDS[hsn]) return; // unknown HSN, skip

        const correctTaxId = getCorrectTaxId(hsn, isInterstate);
        if (item.tax_id !== correctTaxId) {
            issues.push({
                index,
                message: !isInterstate
                    ? 'IGST cannot be applied as this is an intrastate transaction. Tax must be CGST+SGST.'
                    : 'CGST/SGST cannot be applied for interstate. Tax must be IGST.',
            });
        }
    });

    return issues;
};

