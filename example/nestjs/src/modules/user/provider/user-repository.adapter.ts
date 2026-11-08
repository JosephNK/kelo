import { Injectable } from '@nestjs/common';

import type { User } from '@/modules/user/model/user.entity';
import type { UserRepositoryPort } from '@/modules/user/port/user-repository.port';

@Injectable()
export class UserRepositoryAdapter implements UserRepositoryPort {
  private readonly users: ReadonlyMap<string, User> = new Map([
    ['1', { id: '1', email: 'demo@example.com' }],
  ]);

  findById(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }
}
