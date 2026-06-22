import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { env } from '../config';
import {
  buildAuthorizationUrl,
  disconnectAccount,
  handleOAuthCallback,
} from '../services/amazon/auth.service';
import { SellerAccount } from '../models';

export async function getAuthUrl(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const accountId = req.query.accountId as string;
    if (!accountId) {
      throw new AppError(400, 'accountId is required');
    }

    const account = await SellerAccount.findByPk(accountId);
    if (!account) {
      throw new AppError(404, 'Account not found');
    }

    const authorizationUrl = buildAuthorizationUrl(accountId, account.region);
    res.json({ authorizationUrl });
  } catch (err) {
    next(err);
  }
}

export async function oauthCallback(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const query = req.query as {
      spapi_oauth_code?: string;
      state?: string;
      selling_partner_id?: string;
      error?: string;
    };

    if (query.error) {
      res.redirect(`${env.FRONTEND_URL}/accounts?error=${encodeURIComponent(query.error)}`);
      return;
    }

    await handleOAuthCallback(query);
    res.redirect(`${env.FRONTEND_URL}/accounts?connected=1`);
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'OAuth connection failed';
    res.redirect(`${env.FRONTEND_URL}/accounts?error=${encodeURIComponent(message)}`);
  }
}

export async function disconnect(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const accountId = Array.isArray(req.params.accountId)
      ? req.params.accountId[0]
      : req.params.accountId;
    await disconnectAccount(accountId);
    res.json({ message: 'Account disconnected' });
  } catch (err) {
    next(err);
  }
}
