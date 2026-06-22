import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as accountService from '../services/account.service';
import * as productService from '../services/product.service';

export async function listAccounts(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const accounts = await accountService.listAccounts();
    res.json(accounts);
  } catch (err) {
    next(err);
  }
}

export async function createAccount(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { name, marketplace_id, region } = req.body;
    if (!name || !marketplace_id || !region) {
      res.status(400).json({ error: 'name, marketplace_id, and region are required' });
      return;
    }
    const account = await accountService.createAccount({ name, marketplace_id, region });
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
}

export async function updateAccount(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { name, seller_id, marketplace_id, region, is_active } = req.body;
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const account = await accountService.updateAccount(id, {
      name,
      seller_id,
      marketplace_id,
      region,
      is_active,
    });
    res.json(account);
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await accountService.deleteAccount(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getProducts(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, search, page, limit } = req.query;
    const result = await productService.getProducts({
      accountId: accountId as string,
      search: search as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
