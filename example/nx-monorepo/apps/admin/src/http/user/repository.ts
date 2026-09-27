import type { UserPort } from "@/domain/user/port";
import type { User, UserStatus } from "@/domain/user/model";
import { createApiClient, UsersService } from "@/http";
import { toUser } from "./mapper";

const api = createApiClient({ apiUrl: process.env.NEST_API_URL });

export class UserRepository implements UserPort {
  private readonly service = new UsersService(api);

  async findById(id: string): Promise<User | null> {
    const dto = await this.service.getUser(id);
    return toUser(dto);
  }

  async list(status?: UserStatus): Promise<User[]> {
    const dtos = await this.service.listUsers(status ? { status } : undefined);
    return dtos.map(toUser);
  }

  async create(input: { email: string }): Promise<User> {
    const dto = await this.service.createUser(input);
    return toUser(dto);
  }
}
