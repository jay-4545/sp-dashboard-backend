import { Op, WhereOptions } from 'sequelize';
import { Product, SellerAccount } from '../models';
import { loadCostLookup, resolveCostFromLookup } from './cost.service';

export interface ProductsQuery {
  accountId?: string;
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export async function getProducts(query: ProductsQuery) {
  const page = query.page || 1;
  const limit = Math.min(query.limit || 20, 100);
  const offset = (page - 1) * limit;

  const where: WhereOptions = {};
  if (query.accountId) where.account_id = query.accountId;
  if (query.search) {
    Object.assign(where, {
      [Op.or]: [
        { sku: { [Op.iLike]: `%${query.search}%` } },
        { asin: { [Op.iLike]: `%${query.search}%` } },
        { title: { [Op.iLike]: `%${query.search}%` } },
      ],
    });
  }

  const { rows, count } = await Product.findAndCountAll({
    where,
    include: [{ model: SellerAccount, as: 'account', attributes: ['name'] }],
    order: [['updated_at', 'DESC']],
    limit,
    offset,
  });

  // Cost lookup per account so each listing shows margin.
  const lookupsByAccount = new Map<string, Awaited<ReturnType<typeof loadCostLookup>>>();
  for (const p of rows) {
    if (!lookupsByAccount.has(p.account_id)) {
      lookupsByAccount.set(p.account_id, await loadCostLookup(p.account_id));
    }
  }

  const data = rows.map((row) => {
    const p = row.toJSON() as unknown as Record<string, unknown>;
    const lookup = lookupsByAccount.get(row.account_id)!;
    const cost = resolveCostFromLookup(lookup, row.sku);
    const price = num(p.selling_price);
    const unitCost = cost.found ? cost.unitCost : 0;
    const margin = price > 0 && cost.found ? Math.round(((price - unitCost) / price) * 10000) / 100 : null;

    return {
      ...p,
      // Status array → readable flags.
      is_buyable: Array.isArray(p.listing_status)
        ? (p.listing_status as string[]).includes('BUYABLE')
        : null,
      is_discoverable: Array.isArray(p.listing_status)
        ? (p.listing_status as string[]).includes('DISCOVERABLE')
        : null,
      cost: {
        unitCost: cost.found ? Math.round(unitCost * 100) / 100 : null,
        hasCost: cost.found,
        currency: cost.currency,
      },
      profit: {
        perUnit: cost.found ? Math.round((price - unitCost) * 100) / 100 : null,
        marginPct: margin,
      },
    };
  });

  return { data, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}