import { v4 as uuidv4 } from 'uuid';
import { SellerAccount, SellerRegion } from '../models/SellerAccount';
import { AppError } from '../middleware/error.middleware';

const MAX_ACCOUNTS = 5;

function formatAccount(account: SellerAccount) {
  return {
    id: account.id,
    name: account.name,
    seller_id: account.seller_id,
    marketplace_id: account.marketplace_id,
    region: account.region,
    is_active: account.is_active,
    is_connected: Boolean(account.refresh_token),
    token_expires_at: account.token_expires_at,
    last_synced_at: account.last_synced_at,
    created_at: account.created_at,
  };
}

export async function listAccounts() {
  const accounts = await SellerAccount.findAll({ order: [['name', 'ASC']] });
  return accounts.map(formatAccount);
}

export async function createAccount(data: {
  name: string;
  marketplace_id: string;
  region: SellerRegion;
}) {
  const count = await SellerAccount.count();
  if (count >= MAX_ACCOUNTS) {
    throw new AppError(400, `Maximum of ${MAX_ACCOUNTS} seller accounts allowed`);
  }

  const account = await SellerAccount.create({
    name: data.name,
    seller_id: `PENDING-${uuidv4().slice(0, 8)}`,
    marketplace_id: data.marketplace_id,
    region: data.region,
    is_active: true,
  });

  return formatAccount(account);
}

export async function updateAccount(
  id: string,
  data: {
    name?: string;
    seller_id?: string;
    marketplace_id?: string;
    region?: SellerRegion;
    is_active?: boolean;
  }
) {
  const account = await SellerAccount.findByPk(id);
  if (!account) {
    throw new AppError(404, 'Account not found');
  }

  if (data.seller_id && data.seller_id !== account.seller_id) {
    const existing = await SellerAccount.findOne({ where: { seller_id: data.seller_id } });
    if (existing && existing.id !== id) {
      throw new AppError(400, 'Seller ID already in use');
    }
  }

  await account.update(data);
  return formatAccount(account);
}

export async function deleteAccount(id: string) {
  const account = await SellerAccount.findByPk(id);
  if (!account) {
    throw new AppError(404, 'Account not found');
  }
  await account.destroy();
  return { message: 'Account deleted' };
}
