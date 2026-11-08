import type { Post } from "./model";
import type { PostPort } from "./port";

export const makePostService = (port: PostPort) => ({
  listPosts: (): Promise<Post[]> => port.list(),
});
