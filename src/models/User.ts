import {
  Model,
  DataTypes,
  Optional,
  Sequelize,
} from 'sequelize';

export type UserRole = 'admin' | 'viewer';

export interface UserAttributes {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at?: Date;
  updated_at?: Date;
}

export type UserCreationAttributes = Optional<UserAttributes, 'id' | 'role'>;

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  declare id: string;
  declare email: string;
  declare password_hash: string;
  declare role: UserRole;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

export function initUserModel(sequelize: Sequelize): typeof User {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM('admin', 'viewer'),
        allowNull: false,
        defaultValue: 'viewer',
      },
    },
    {
      sequelize,
      tableName: 'users',
      underscored: true,
    }
  );
  return User;
}
