// GENERATED CODE - DO NOT MODIFY BY HAND
// Source: jkit nextjs-openapi-gen

export interface CreateUserDto {
  email: string;
}

export interface PostDto {
  id: string;
  title: string;
  authorId?: string;
}

export interface UserDto {
  id: string;
  email: string;
  status: UserStatusDto;
  createdAt?: string;
}

export type UserStatusDto = "active" | "inactive" | "banned";
