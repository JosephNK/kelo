// GENERATED CODE - DO NOT MODIFY BY HAND
// Source: jkit nextjs-openapi-gen

import type { KyInstance } from "ky";

import { endpoints } from "../endpoints";

import type { PostDto } from "../types";

export class PostsService {
  constructor(private readonly api: KyInstance) {}

  async listPosts(): Promise<PostDto[]> {
    return this.api.get(endpoints.listPosts()).json<PostDto[]>();
  }
}
