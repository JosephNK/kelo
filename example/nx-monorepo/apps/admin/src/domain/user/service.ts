import type { UserPort } from "./port";
import type { User, UserStatus } from "./model";

export async function getUser(_id: string): Promise<User> {
  return {
    id: _id,
    email: "demo@example.com",
    status: "active",
    createdAt: null,
  };
}

export const makeUserService = (port: UserPort) => ({
  getUser: (id: string) => port.findById(id),
  listUsers: (status?: UserStatus) => port.list(status),
});

export type { UserPort };
