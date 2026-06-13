import bcrypt from 'bcrypt';
import { User } from '../models';
import { signToken } from '../middleware/auth.middleware';
import { AppError } from '../middleware/error.middleware';

export async function login(email: string, password: string) {
  const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });
  if (!user) {
    throw new AppError(401, 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new AppError(401, 'Invalid email or password');
  }

  const token = signToken(user);
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  };
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
