import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as dashboardService from '../services/dashboard.service';

export async function getSummary(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, startDate, endDate } = req.query;
    const summary = await dashboardService.getDashboardSummary({
      accountId: accountId as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json(summary);
  } catch (err) {
    next(err);
  }
}

export async function getOrders(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, status, search, startDate, endDate, page, limit } = req.query;
    const result = await dashboardService.getOrders({
      accountId: accountId as string,
      status: status as string,
      search: search as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getInventory(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, lowStock, search, page, limit } = req.query;
    const result = await dashboardService.getInventory({
      accountId: accountId as string,
      lowStock: lowStock === 'true',
      search: search as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getFinanceEvents(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, search, startDate, endDate, page, limit } = req.query;
    const result = await dashboardService.getFinanceEvents({
      accountId: accountId as string,
      search: search as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getFinancePnl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, startDate, endDate } = req.query;
    const result = await dashboardService.getFinancePnl({
      accountId: accountId as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getSyncStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId } = req.query;
    const result = await dashboardService.getSyncStatus(accountId as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function triggerSync(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, syncType } = req.body;
    if (!accountId || !syncType) {
      res.status(400).json({ error: 'accountId and syncType are required' });
      return;
    }
    const { runSyncForAccount } = await import('../services/sync/syncRunner');
    const job = await runSyncForAccount(accountId, syncType);
    res.json({ message: 'Sync triggered', job });
  } catch (err) {
    next(err);
  }
}
