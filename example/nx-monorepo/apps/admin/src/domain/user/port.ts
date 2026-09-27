import type { User, UserStatus } from "./model";

export interface UserPort {
  findById(id: string): Promise<User | null>;
  list(status?: UserStatus): Promise<User[]>;
  create(input: { email: string }): Promise<User>;
}
