import type { Post } from "./model";

export interface PostPort {
  list(): Promise<Post[]>;
}
