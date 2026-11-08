import type { User } from '@/modules/user/model/user.entity';

export interface UserQueryPort {
  findUser(id: string): Promise<User | null>;
}
