export type UserStatus = "active" | "inactive" | "banned";

export type User = {
  id: string;
  email: string;
  status: UserStatus;
  createdAt: string | null;
};
