/**
 * Amazon SP-API Finance Event Parser — FIXED VERSION
 *
 * Amazon SP-API Finances v0 ma 3 alag prakar hoy che:
 *   - CHARGES  (ItemChargeList / OrderChargeList):
 *       ChargeType = "Principal" | "Tax" | "Shipping" | "GiftWrap" ...
 *       Buyer-paid amount → seller REVENUE (sale par positive, refund par negative).
 *   - FEES     (ItemFeeList / OrderFeeList / ShipmentFeeList):
 *       FeeType = "Commission" (referral) | "FBAPerUnitFulfillmentFee" | ...
 *       Amazon DEDUCT kare → seller COST. Amazon pehlethi NEGATIVE aape che.
 *       Kyarey Math.abs() na karvu.
 *   - PROMOTIONS (PromotionList): seller-funded discount → negative.
 *
 * Have har line ne ek `kind` male che jethi P&L sahi rite bucket kari shake.
 */

export type FinanceLineKind = 'revenue' | 'fee' | 'promotion' | 'refund' | 'tax' | 'other';

export interface ParsedFinanceLine {
  amount: number;        // signed, exactly Amazon je aape che
  currency: string;
  feeType: string | null;
  kind: FinanceLineKind; // P&L bucketing mate
}

/** ChargeTypes je buyer-paid revenue che (Amazon cost nahi). */
const REVENUE_CHARGE_TYPES = new Set([
  'Principal',
  'Shipping',
  'ShippingCharge',
  'GiftWrap',
]);

/** ChargeTypes je tax che (alag handle — usually marketplace-facilitated). */
const TAX_CHARGE_TYPES = new Set([
  'Tax',
  'ShippingTax',
  'GiftWrapTax',
]);

function parseMoney(obj: unknown): { amount: number; currency: string } | null {
  if (!obj || typeof obj !== 'object') return null;
  const record = obj as Record<string, unknown>;

  // SP-API v0 CurrencyAmount vaapre che; ketlak serializers Amount vaapre.
  const rawAmount =
    record.CurrencyAmount !== undefined ? record.CurrencyAmount :
    record.Amount !== undefined ? record.Amount :
    undefined;

  if (rawAmount === undefined) return null;
  const amount = parseFloat(String(rawAmount));
  if (isNaN(amount)) return null;

  const currency = record.CurrencyCode ? String(record.CurrencyCode) : 'INR';
  return { amount, currency };
}

/** Charge component → revenue / tax / refund (type ane sign mujab). */
function parseChargeEntry(
  entry: Record<string, unknown>,
  isAdjustment: boolean
): ParsedFinanceLine | null {
  const money = parseMoney(entry.ChargeAmount) || parseMoney(entry);
  if (!money) return null;

  const chargeType = (entry.ChargeType as string) || null;

  let kind: FinanceLineKind = 'other';
  if (chargeType && TAX_CHARGE_TYPES.has(chargeType)) {
    kind = 'tax';
  } else if (chargeType && REVENUE_CHARGE_TYPES.has(chargeType)) {
    // Adjustment list ma negative principal = buyer ne refund.
    kind = money.amount < 0 || isAdjustment ? 'refund' : 'revenue';
  } else {
    kind = money.amount < 0 ? 'refund' : 'revenue';
  }

  return { ...money, feeType: chargeType, kind };
}

/** Fee component → hammesha Amazon cost (negative). */
function parseFeeEntry(entry: Record<string, unknown>): ParsedFinanceLine | null {
  const money = parseMoney(entry.FeeAmount) || parseMoney(entry);
  if (!money) return null;
  const feeType = (entry.FeeType as string) || (entry.FeeDescription as string) || null;
  return { ...money, feeType, kind: 'fee' };
}

/** Promotion component → seller-funded discount (negative). */
function parsePromotionEntry(entry: Record<string, unknown>): ParsedFinanceLine | null {
  const money = parseMoney(entry.PromotionAmount) || parseMoney(entry);
  if (!money) return null;
  const feeType = (entry.PromotionType as string) || 'Promotion';
  return { ...money, feeType, kind: 'promotion' };
}

function pushChargeList(lines: ParsedFinanceLine[], list: unknown, isAdjustment: boolean) {
  if (!Array.isArray(list)) return;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const parsed = parseChargeEntry(entry as Record<string, unknown>, isAdjustment);
    if (parsed) lines.push(parsed);
  }
}

function pushFeeList(lines: ParsedFinanceLine[], list: unknown) {
  if (!Array.isArray(list)) return;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const parsed = parseFeeEntry(entry as Record<string, unknown>);
    if (parsed) lines.push(parsed);
  }
}

function pushPromotionList(lines: ParsedFinanceLine[], list: unknown) {
  if (!Array.isArray(list)) return;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const parsed = parsePromotionEntry(entry as Record<string, unknown>);
    if (parsed) lines.push(parsed);
  }
}

function pushShipmentItems(
  lines: ParsedFinanceLine[],
  items: unknown,
  isAdjustment: boolean
) {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    // Charges (revenue / tax)
    pushChargeList(lines, record.ItemChargeList, isAdjustment);
    pushChargeList(lines, record.ItemChargeAdjustmentList, true);
    // Fees (Amazon cost)
    pushFeeList(lines, record.ItemFeeList);
    pushFeeList(lines, record.ItemFeeAdjustmentList);
    // Promotions (seller-funded)
    pushPromotionList(lines, record.PromotionList);
    pushPromotionList(lines, record.PromotionAdjustmentList);
  }
}

export function expandFinancialEvent(event: Record<string, unknown>): ParsedFinanceLine[] {
  const lines: ParsedFinanceLine[] = [];

  // Order-level charges = revenue/tax
  pushChargeList(lines, event.OrderChargeList, false);
  pushChargeList(lines, event.OrderChargeAdjustmentList, true);

  // Order/shipment-level fees = Amazon cost
  pushFeeList(lines, event.FeeList);
  pushFeeList(lines, event.OrderFeeList);
  pushFeeList(lines, event.ShipmentFeeList);
  pushFeeList(lines, event.ShipmentFeeAdjustmentList);

  // Direct payments (e.g. COD / stored value) = revenue-side
  if (Array.isArray(event.DirectPaymentList)) {
    for (const dp of event.DirectPaymentList) {
      if (!dp || typeof dp !== 'object') continue;
      const rec = dp as Record<string, unknown>;
      const money = parseMoney(rec.DirectPaymentAmount);
      if (money) {
        lines.push({
          ...money,
          feeType: (rec.DirectPaymentType as string) || 'DirectPayment',
          kind: money.amount < 0 ? 'refund' : 'revenue',
        });
      }
    }
  }

  // Item-level breakdown
  pushShipmentItems(lines, event.ShipmentItemList, false);
  pushShipmentItems(lines, event.ShipmentItemAdjustmentList, true);

  // Adjustment events (e.g. reimbursements)
  const adjustment = parseMoney(event.AdjustmentAmount);
  if (adjustment) {
    lines.push({
      ...adjustment,
      feeType: (event.AdjustmentType as string) || 'Adjustment',
      kind: adjustment.amount < 0 ? 'fee' : 'revenue',
    });
  }

  // Flat service-fee event (e.g. ServiceFeeEvent, SellerDealPaymentEvent)
  if (lines.length === 0 && event.FeeType) {
    const money = parseMoney(event.FeeAmount);
    if (money) {
      lines.push({
        ...money,
        feeType: (event.FeeType as string) || (event.FeeDescription as string) || null,
        kind: 'fee',
      });
    }
  }

  return lines;
}

/** Fallback classification — legacy rows je pase stored `kind` nathi. */
function classifyByAmount(feeType: string | null | undefined, amount: number): FinanceLineKind {
  if (feeType && REVENUE_CHARGE_TYPES.has(feeType)) return amount < 0 ? 'refund' : 'revenue';
  if (feeType && TAX_CHARGE_TYPES.has(feeType)) return 'tax';
  return amount < 0 ? 'fee' : 'revenue';
}

/** Stored DB columns vaapro jyare hoy — raw_data re-parse karvanu tale. */
export function getEffectiveFinanceLines(row: {
  amount?: number | string | null;
  currency?: string | null;
  fee_type?: string | null;
  kind?: string | null;
  raw_data?: Record<string, unknown> | null;
}): ParsedFinanceLine[] {
  if (row.amount !== null && row.amount !== undefined && row.amount !== '') {
    const amount = Number(row.amount);
    if (!isNaN(amount)) {
      return [
        {
          amount,
          currency: row.currency || 'INR',
          feeType: row.fee_type || null,
          kind: (row.kind as FinanceLineKind) || classifyByAmount(row.fee_type, amount),
        },
      ];
    }
  }

  if (!row.raw_data) return [];
  return expandFinancialEvent(row.raw_data);
}

export function enrichFinancialEventRecord<
  T extends {
    amount?: number | string | null;
    currency?: string | null;
    fee_type?: string | null;
    raw_data?: Record<string, unknown> | null;
  },
>(record: T): T {
  if (record.amount !== null && record.amount !== undefined) return record;
  if (!record.raw_data) return record;

  const lines = expandFinancialEvent(record.raw_data);
  if (lines.length === 0) return record;

  if (lines.length === 1) {
    return {
      ...record,
      amount: lines[0].amount,
      currency: lines[0].currency,
      fee_type: lines[0].feeType,
    };
  }

  return {
    ...record,
    amount: lines.reduce((sum, line) => sum + line.amount, 0),
    currency: lines[0].currency,
    fee_type: lines.map((line) => line.feeType).filter(Boolean).join(', '),
  };
}