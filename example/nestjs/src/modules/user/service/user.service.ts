import { Inject, Injectable } from '@nestjs/common';

import { UserNotFoundError } from '@/modules/user/exception/user-not-found.error';
import { USER_REPOSITORY_PORT } from '@/modules/user/port/port-tokens';
import type { UserQueryPort } from '@/modules/user/port/user-query.port';
import type { UserRepositoryPort } from '@/modules/user/port/user-repository.port';

@Injectable()
export class UserService implements UserQueryPort {
  constructor(
    @Inject(USER_REPOSITORY_PORT)
    private readonly users: UserRepositoryPort,
  ) {}

  async findUser(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new UserNotFoundError(id);
    return user;
  }
}
