import { makePostService } from "@/domain/post/service";

import { PostRepository } from "./repository";

export const createPostService = () => makePostService(new PostRepository());
