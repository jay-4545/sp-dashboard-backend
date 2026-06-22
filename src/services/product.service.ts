import { Op, WhereOptions } from 'sequelize';
import { Product } from '../models';
import { SellerAccount } from '../models';

export interface ProductsQuery {
  accountId?: string;
  search?: string;
  page?: number;
  limit?: number;
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

  return { data: rows, pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) } };
}
