import type { User } from "@/domain/user/model";
import type { UserDto } from "@/http/_generated/types";

export const toUser = (dto: UserDto): User => ({
  id: dto.id,
  email: dto.email,
  status: dto.status,
  createdAt: dto.createdAt ?? null,
});
