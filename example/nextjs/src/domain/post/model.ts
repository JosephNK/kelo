import type { User } from "@/domain/user/model";

export type Post = {
  id: string;
  title: string;
  authorId: User["id"] | null;
};
