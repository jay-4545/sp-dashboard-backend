import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as authService from '../services/auth.service';
import { AppError } from '../middleware/error.middleware';

export async function login(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function me(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new AppError(401, 'Not authenticated');
    }
    const user = await authService.getUserById(req.user.userId);
    res.json(user);
  } catch (err) {
    next(err);
  }
}
