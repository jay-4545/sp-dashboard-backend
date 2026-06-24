import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as sellerProfitService from '../services/sellerProfit.service';

export async function getSellerProfit(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { accountId, startDate, endDate, search, page, limit } = req.query;
    const result = await sellerProfitService.getSellerProfit({
      accountId: accountId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      search: search as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
