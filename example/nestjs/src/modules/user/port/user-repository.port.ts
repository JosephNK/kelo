import type { User } from '@/modules/user/model/user.entity';

export interface UserRepositoryPort {
  findById(id: string): Promise<User | null>;
}
