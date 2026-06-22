import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { User, RefreshToken } from '../models';
import { signAccessToken } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';
import { env } from '../config';

function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshTokenValue(): string {
  return crypto.randomBytes(48).toString('base64url');
}

async function createRefreshToken(userId: string): Promise<string> {
  const rawToken = generateRefreshTokenValue();
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(
    Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000
  );

  await RefreshToken.create({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  return rawToken;
}

async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawToken);
  await RefreshToken.update(
    { revoked_at: new Date() },
    { where: { token_hash: tokenHash, revoked_at: null } }
  );
}

function formatUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });
  if (!user) {
    throw new AppError(401, 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AppError(401, 'Invalid email or password');
  }

  const token = signAccessToken(user);
  const refreshToken = await createRefreshToken(user.id);

  return {
    token,
    refreshToken,
    user: formatUser(user),
  };
}

export async function refreshSession(rawRefreshToken: string) {
  if (!rawRefreshToken) {
    throw new AppError(401, 'Refresh token required');
  }

  const tokenHash = hashRefreshToken(rawRefreshToken);
  const record = await RefreshToken.findOne({
    where: { token_hash: tokenHash, revoked_at: null },
  });

  if (!record || record.expires_at < new Date()) {
    if (record) {
      await record.update({ revoked_at: new Date() });
    }
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findByPk(record.user_id);
  if (!user) {
    throw new AppError(401, 'User not found');
  }

  await record.update({ revoked_at: new Date() });

  const token = signAccessToken(user);
  const refreshToken = await createRefreshToken(user.id);

  return {
    token,
    refreshToken,
    user: formatUser(user),
  };
}

export async function logout(rawRefreshToken?: string) {
  if (rawRefreshToken) {
    await revokeRefreshToken(rawRefreshToken);
  }
  return { message: 'Logged out' };
}

export async function getUserById(userId: string) {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'email', 'role', 'created_at'],
  });
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  return user;
}
