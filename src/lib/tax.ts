import { InvoiceItem, ZohoTax } from '@/types/invoice';

// Single source of truth for our registered GST state
export const BUSINESS_STATE_NAME = 'Haryana';

// Common codes/labels Zoho or our UI might use for Haryana
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

// --- HSN → hardcoded Zoho tax IDs (simple map) ---
// Fill these with your actual Zoho tax IDs for each HSN.
// Example:
// '83062990': { inter: '3355...IGST_18_ID', intra: '3355...GST_18_ID' }
export interface HsnTaxIds {
    inter: string; // interstate (IGST) tax_id
    intra: string; // intrastate (CGST/SGST group) tax_id
}

export const HSN_TAX_IDS: Record<string, HsnTaxIds> = {
    // '14049070': { inter: 'IGST_0_ID', intra: 'GST_0_ID' },
    // '05080010': { inter: 'IGST_0_25_ID', intra: 'GST_0_25_ID' },
    // '71179090': { inter: 'IGST_3_ID', intra: 'GST_3_ID' },
    // '83062990': { inter: 'IGST_18_ID', intra: 'GST_18_ID' },
    // '74198090': { inter: 'IGST_18_ID', intra: 'GST_18_ID' },
    // '44209090': { inter: 'IGST_3_ID', intra: 'GST_3_ID' },
    // '39269090': { inter: 'IGST_3_ID', intra: 'GST_3_ID' },
    // '999591': { inter: 'IGST_0_ID', intra: 'GST_0_ID' },
    // '999799': { inter: 'IGST_0_ID', intra: 'GST_0_ID' },
};

// --- HSN → tax rate rules (percentage) ---
// NOTE: This is the single canonical mapping for percentages; UI convenience lists should read from here.
export const HSN_TAX_RATES: Record<string, number> = {
    '14049070': 0,    // Rudrakshas
    '05080010': 0.25, // Gemstones and Raw Crystals
    '71179090': 3,    // Bracelets, Malas and Decorative Items
    '83062990': 18,   // Vastu Metal
    '74198090': 18,   // Vastu Copper/Brass
    '44209090': 3,    // Vastu Wooden (miscellaneous)
    '39269090': 3,    // Miscellaneous Goods
    '999591': 0,      // Poojas and Services
    '999799': 0,      // Miscellaneous Services
};

const isIGSTTax = (tax: ZohoTax | undefined): boolean => {
    if (!tax) return false;
    return tax.tax_name.toUpperCase().includes('IGST');
};

const findMatchingTaxForRate = (
    rate: number,
    taxes: ZohoTax[],
    isInterstate: boolean
): ZohoTax | undefined => {
    const desiredIsIGST = isInterstate;
    const candidates = taxes.filter((t) => {
        const pctMatch = Math.abs(t.tax_percentage - rate) < 0.01;
        if (!pctMatch) return false;
        const isIGST = isIGSTTax(t);
        if (rate === 0) {
            // For 0% we allow both, caller will usually send NO_TAX anyway
            return true;
        }
        return desiredIsIGST ? isIGST : !isIGST;
    });

    return candidates[0];
};

export interface NormalizedTaxDecision {
    taxId: string;
    autoCorrected: boolean;
    note?: string;
}

interface NormalizeContext {
    item: InvoiceItem;
    updates: Partial<InvoiceItem>;
    taxes: ZohoTax[];
    isInterstate: boolean;
}

/**
 * Decide the best tax_id for a line item given its HSN, current tax,
 * and whether the order is inter/intra state.
 *
 * - For interstate: prefers IGST for the applicable rate.
 * - For intrastate: prefers a non-IGST group (CGST+SGST).
 * - For 0% categories: uses 'NO_TAX'.
 *
 * Returns only the fields that should be updated on the item (tax_id and
 * optional UI-only auto-correction flags/message).
 */
export const normalizeItemTaxForContext = ({
    item,
    updates,
    taxes,
    isInterstate,
}: NormalizeContext): Partial<InvoiceItem> => {
    // Don't touch system/service lines or when we don't have any taxes yet
    if (!taxes.length || item.zoho_item_id === '__system__') {
        return updates;
    }

    const merged: InvoiceItem = { ...item, ...updates };

    // Always recalculate tax if HSN changes or if tax_id is missing/invalid
    const isNewProduct = !merged.zoho_item_id || merged.zoho_item_id === '';
    const hsn = merged.hsn_or_sac || '';
    const hsnRate = HSN_TAX_RATES[hsn];
    const currentTax = taxes.find((t) => t.tax_id === merged.tax_id);
    const currentRate = currentTax?.tax_percentage ?? hsnRate;

    if (currentRate === undefined) {
        return updates;
    }

    // 0% categories: always treat as NO_TAX at the UI level.
    if (currentRate === 0 || hsnRate === 0) {
        const next: Partial<InvoiceItem> = {
            ...updates,
            tax_id: 'NO_TAX',
            tax_auto_corrected: merged.tax_id !== 'NO_TAX',
            tax_correction_note:
                merged.tax_id !== 'NO_TAX'
                    ? 'Converted to 0% tax for this HSN.'
                    : undefined,
        };
        return next;
    }

    // Always recalculate if HSN changed
    const explicitIds = HSN_TAX_IDS[hsn];
    let preferredTax: ZohoTax | undefined;

    if (explicitIds) {
        const targetId = isInterstate ? explicitIds.inter : explicitIds.intra;
        preferredTax = taxes.find((t) => t.tax_id === targetId);
    } else {
        preferredTax = findMatchingTaxForRate(hsnRate, taxes, isInterstate);
    }

    if (!preferredTax) {
        return updates;
    }

    const preferredIsIGST = isIGSTTax(preferredTax);
    const currentIsIGST = isIGSTTax(currentTax);

    // If HSN changed or current tax doesn't match, update tax_id
    if (!currentTax || merged.hsn_or_sac !== item.hsn_or_sac || Math.abs(currentTax.tax_percentage - preferredTax.tax_percentage) >= 0.01 || currentIsIGST !== preferredIsIGST) {
        let note: string | undefined;
        if (!isInterstate && currentIsIGST) {
            note = 'IGST cannot be applied as this is an intrastate transaction; switched to CGST+SGST.';
        } else if (isInterstate && currentTax && !currentIsIGST) {
            note = 'Converted CGST/SGST to IGST because this is an interstate transaction.';
        }
        return {
            ...updates,
            tax_id: preferredTax.tax_id,
            tax_auto_corrected: !!note,
            tax_correction_note: note,
        };
    }

    // If we're setting tax for a brand new product with only HSN filled, auto-fill the tax_id when it was previously empty.
    if (isNewProduct && !merged.tax_id) {
        return {
            ...updates,
            tax_id: preferredTax.tax_id,
        };
    }
    return updates;
};

export interface TaxValidationIssue {
    index: number;
    message: string;
}

/**
 * Defensive validation to ensure that, after all auto-corrections,
 * no line item is left with an obviously wrong interstate/intrastate tax.
 */
export const validateTaxesForOrder = (
    items: InvoiceItem[],
    taxes: ZohoTax[],
    isInterstate: boolean
): TaxValidationIssue[] => {
    if (!taxes.length) return [];

    const issues: TaxValidationIssue[] = [];

    items.forEach((item, index) => {
        if (!item.tax_id || item.tax_id === 'NO_TAX') {
            return;
        }
        const tax = taxes.find((t) => t.tax_id === item.tax_id);
        if (!tax) return;

        const igst = isIGSTTax(tax);
        const pct = tax.tax_percentage;

        // Allow zero-rated taxes in all cases
        if (pct === 0) return;

        if (!isInterstate && igst) {
            issues.push({
                index,
                message: 'IGST cannot be applied as this is an intrastate transaction. Please choose a CGST+SGST tax.',
            });
        } else if (isInterstate && !igst) {
            // Only flag if an IGST rate with same percentage exists, meaning a better tax is available.
            const hasEquivalentIGST = taxes.some(
                (t) =>
                    isIGSTTax(t) &&
                    Math.abs(t.tax_percentage - pct) < 0.01
            );
            if (hasEquivalentIGST) {
                issues.push({
                    index,
                    message: 'For interstate orders, IGST should be applied instead of CGST/SGST for this rate.',
                });
            }
        }
    });

    return issues;
};

