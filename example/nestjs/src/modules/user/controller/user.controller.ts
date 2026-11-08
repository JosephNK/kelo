import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
} from '@nestjs/common';

import { UserDataResponseDto } from '@/modules/user/dto/user.response.dto';
import { USER_QUERY_PORT } from '@/modules/user/port/port-tokens';
import type { UserQueryPort } from '@/modules/user/port/user-query.port';

@Controller('users')
export class UserController {
  constructor(
    @Inject(USER_QUERY_PORT)
    private readonly users: UserQueryPort,
  ) {}

  @Get(':id')
  async getUser(@Param('id') id: string): Promise<UserDataResponseDto> {
    const user = await this.users.findUser(id);
    if (!user) throw new NotFoundException();
    return UserDataResponseDto.from(user);
  }
}
