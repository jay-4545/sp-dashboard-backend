import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { ProductCost } from '../models';
import { setProductCost } from '../services/cost.service';
import * as productService from '../services/product.service';

/**
 * Product cost (COGS) management.
 *  GET    /api/products/costs           — list cost history
 *  POST   /api/products/costs           — set/update a SKU cost (admin)
 *  POST   /api/products/costs/bulk      — bulk set costs (admin)
 *  GET    /api/products                 — listings with cost + margin
 */

export async function listCosts(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, sku } = req.query;
    const where: Record<string, unknown> = {};
    if (accountId) where.account_id = accountId as string;
    if (sku) where.sku = sku as string;

    const costs = await ProductCost.findAll({
      where,
      order: [
        ['sku', 'ASC'],
        ['effective_from', 'DESC'],
      ],
    });
    res.json({ data: costs });
  } catch (err) {
    next(err);
  }
}

export async function upsertCost(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const {
      accountId,
      sku,
      asin,
      unitCost,
      shippingCost,
      packagingCost,
      currency,
      effectiveFrom,
      note,
    } = req.body;

    if (!accountId || !sku || unitCost === undefined) {
      res.status(400).json({ error: 'accountId, sku and unitCost are required' });
      return;
    }

    const cost = await setProductCost({
      accountId,
      sku,
      asin: asin ?? null,
      unitCost: Number(unitCost),
      shippingCost: shippingCost !== undefined ? Number(shippingCost) : 0,
      packagingCost: packagingCost !== undefined ? Number(packagingCost) : 0,
      currency: currency || 'INR',
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : undefined,
      note: note ?? null,
    });

    res.status(201).json({ message: 'Cost saved', data: cost });
  } catch (err) {
    next(err);
  }
}

export async function bulkUpsertCosts(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, items } = req.body as {
      accountId: string;
      items: Array<{
        sku: string;
        asin?: string;
        unitCost: number;
        shippingCost?: number;
        packagingCost?: number;
        currency?: string;
        effectiveFrom?: string;
        note?: string;
      }>;
    };

    if (!accountId || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'accountId and a non-empty items array are required' });
      return;
    }

    let saved = 0;
    for (const item of items) {
      if (!item.sku || item.unitCost === undefined) continue;
      await setProductCost({
        accountId,
        sku: item.sku,
        asin: item.asin ?? null,
        unitCost: Number(item.unitCost),
        shippingCost: item.shippingCost !== undefined ? Number(item.shippingCost) : 0,
        packagingCost: item.packagingCost !== undefined ? Number(item.packagingCost) : 0,
        currency: item.currency || 'INR',
        effectiveFrom: item.effectiveFrom ? new Date(item.effectiveFrom) : undefined,
        note: item.note ?? null,
      });
      saved++;
    }

    res.status(201).json({ message: `Saved ${saved} costs`, saved });
  } catch (err) {
    next(err);
  }
}

export async function getProducts(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, search, status, page, limit } = req.query;
    const result = await productService.getProducts({
      accountId: accountId as string,
      search: search as string,
      status: status as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}