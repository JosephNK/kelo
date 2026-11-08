import type { Post } from "@/domain/post/model";
import type { PostDto } from "@/http/_generated/types";

export const toPost = (dto: PostDto): Post => ({
  id: dto.id,
  title: dto.title,
  authorId: dto.authorId ?? null,
});
