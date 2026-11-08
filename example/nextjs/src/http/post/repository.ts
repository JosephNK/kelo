import type { Post } from "@/domain/post/model";
import type { PostPort } from "@/domain/post/port";
import { PostsService } from "@/http/_generated/services/posts";
import { createApiClient } from "@/http/client";

import { toPost } from "./mapper";

export class PostRepository implements PostPort {
  private readonly service = new PostsService(
    createApiClient({ apiUrl: process.env.NEST_API_URL }),
  );

  async list(): Promise<Post[]> {
    const dtos = await this.service.listPosts();
    return dtos.map(toPost);
  }
}
