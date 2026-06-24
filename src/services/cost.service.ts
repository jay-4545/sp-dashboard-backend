import { Op } from 'sequelize';
import { ProductCost } from '../models/ProductCost';

/**
 * costService — COGS (cost of goods) resolve karva no central logic.
 *
 * Profit = Revenue − Amazon Fees − Promotions − Refunds − COGS.
 * Return/refund par: revenue pacho jaay + je COGS gumayu (jo product
 * restock na thay) e pan loss ma ganay.
 *
 * Cost effective-dated che, etle har SKU mate aapne te date par je cost
 * lagu hato te laavie chie.
 */

export interface ResolvedCost {
  unitCost: number;
  currency: string;
  found: boolean;
}

/**
 * Ek account na BADHA active+historical costs ek j query ma load kare ane
 * fast in-memory lookup mate map banave. Bulk profit calculation mate vaapro
 * (per-order query karva karta khub fast).
 */
export interface CostLookup {
  /** sku → cost entries (newest effective_from first). */
  bySku: Map<string, Array<{ unitCost: number; currency: string; from: number; to: number | null }>>;
}

export async function loadCostLookup(accountId: string): Promise<CostLookup> {
  const rows = await ProductCost.findAll({
    where: { account_id: accountId },
    order: [['effective_from', 'DESC']],
  });

  const bySku = new Map<string, Array<{ unitCost: number; currency: string; from: number; to: number | null }>>();

  for (const row of rows) {
    const list = bySku.get(row.sku) || [];
    list.push({
      unitCost: row.landed_cost,
      currency: row.currency,
      from: new Date(row.effective_from).getTime(),
      to: row.effective_to ? new Date(row.effective_to).getTime() : null,
    });
    bySku.set(row.sku, list);
  }

  return { bySku };
}

/**
 * Aapeli date par SKU no effective cost return kare. date na aape to atyaar no
 * latest active cost laave che.
 */
export function resolveCostFromLookup(
  lookup: CostLookup,
  sku: string | null | undefined,
  at?: Date | null
): ResolvedCost {
  if (!sku) return { unitCost: 0, currency: 'INR', found: false };

  const entries = lookup.bySku.get(sku);
  if (!entries || entries.length === 0) {
    return { unitCost: 0, currency: 'INR', found: false };
  }

  const t = at ? new Date(at).getTime() : Date.now();

  // entries newest-first chhe; pehlo match je window ma `t` aave te lai lo.
  for (const e of entries) {
    const afterStart = t >= e.from;
    const beforeEnd = e.to === null || t <= e.to;
    if (afterStart && beforeEnd) {
      return { unitCost: e.unitCost, currency: e.currency, found: true };
    }
  }

  // Koi window match na thay (e.g. order cost set karya pehla no) — sauthi
  // juno (closest historical) cost vaapro fallback tarike.
  const oldest = entries[entries.length - 1];
  return { unitCost: oldest.unitCost, currency: oldest.currency, found: true };
}

/**
 * DB-based single lookup (jyare bulk lookup na hoy). Order sync vakhate
 * ek-ek item mate vaaprai shake.
 */
export async function resolveCostForSku(
  accountId: string,
  sku: string | null | undefined,
  at?: Date | null
): Promise<ResolvedCost> {
  if (!sku) return { unitCost: 0, currency: 'INR', found: false };

  const t = at ? new Date(at) : new Date();

  const row = await ProductCost.findOne({
    where: {
      account_id: accountId,
      sku,
      effective_from: { [Op.lte]: t },
      [Op.or]: [{ effective_to: null }, { effective_to: { [Op.gte]: t } }],
    },
    order: [['effective_from', 'DESC']],
  });

  if (row) {
    return { unitCost: row.landed_cost, currency: row.currency, found: true };
  }

  // Fallback: sauthi juno available cost.
  const fallback = await ProductCost.findOne({
    where: { account_id: accountId, sku },
    order: [['effective_from', 'ASC']],
  });

  if (fallback) {
    return { unitCost: fallback.landed_cost, currency: fallback.currency, found: true };
  }

  return { unitCost: 0, currency: 'INR', found: false };
}

/**
 * Naya cost set karva no helper. Aagla active cost ne `effective_to` set
 * karine band kare ane navo record banave — etle history maintain thay.
 */
export async function setProductCost(params: {
  accountId: string;
  sku: string;
  asin?: string | null;
  unitCost: number;
  shippingCost?: number;
  packagingCost?: number;
  currency?: string;
  effectiveFrom?: Date;
  note?: string | null;
}): Promise<ProductCost> {
  const effectiveFrom = params.effectiveFrom ?? new Date();

  // Aagla open-ended cost ne aaje thi band karo.
  await ProductCost.update(
    { effective_to: new Date(effectiveFrom.getTime() - 1) },
    {
      where: {
        account_id: params.accountId,
        sku: params.sku,
        effective_to: null,
      },
    }
  );

  return ProductCost.create({
    account_id: params.accountId,
    sku: params.sku,
    asin: params.asin ?? null,
    unit_cost: params.unitCost,
    shipping_cost: params.shippingCost ?? 0,
    packaging_cost: params.packagingCost ?? 0,
    currency: params.currency ?? 'INR',
    effective_from: effectiveFrom,
    effective_to: null,
    note: params.note ?? null,
  });
}