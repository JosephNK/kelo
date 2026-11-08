import type { User } from '@/modules/user/model/user.entity';

export class UserDataResponseDto {
  constructor(
    readonly id: string,
    readonly email: string,
  ) {}

  static from(user: User): UserDataResponseDto {
    return new UserDataResponseDto(user.id, user.email);
  }
}
