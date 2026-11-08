import { Module } from '@nestjs/common';

import { UserController } from './controller/user.controller';
import { USER_QUERY_PORT, USER_REPOSITORY_PORT } from './port/port-tokens';
import { UserRepositoryAdapter } from './provider/user-repository.adapter';
import { UserService } from './service/user.service';

@Module({
  controllers: [UserController],
  providers: [
    { provide: USER_REPOSITORY_PORT, useClass: UserRepositoryAdapter },
    { provide: USER_QUERY_PORT, useClass: UserService },
  ],
  exports: [USER_QUERY_PORT],
})
export class UserModule {}
