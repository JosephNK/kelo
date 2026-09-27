import type { UserPort } from "./port";
import type { User } from "./model";

export async function getUser(_id: string): Promise<User> {
  return {
    id: _id,
    email: "demo@example.com",
    status: "active",
    createdAt: null,
  };
}

export type { UserPort };
