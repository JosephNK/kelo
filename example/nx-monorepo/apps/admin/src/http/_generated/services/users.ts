// GENERATED CODE - DO NOT MODIFY BY HAND
// Source: jkit nextjs-openapi-gen

import type { KyInstance } from "ky";

import { endpoints } from "../endpoints";

import type { CreateUserDto, UserDto, UserStatusDto } from "../types";

export class UsersService {
  constructor(private readonly api: KyInstance) {}

  private toSearchParams(
    q: Record<string, unknown> | undefined,
  ): URLSearchParams {
    const p = new URLSearchParams();
    if (!q) return p;
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) for (const item of v) p.append(k, String(item));
      else p.set(k, String(v));
    }
    return p;
  }

  async listUsers(query?: { status?: UserStatusDto }): Promise<UserDto[]> {
    return this.api
      .get(endpoints.listUsers(), { searchParams: this.toSearchParams(query) })
      .json<UserDto[]>();
  }

  async createUser(body: CreateUserDto): Promise<UserDto> {
    return this.api
      .post(endpoints.createUser(), { json: body })
      .json<UserDto>();
  }

  async getUser(id: string): Promise<UserDto> {
    return this.api.get(endpoints.getUser(id)).json<UserDto>();
  }
}
