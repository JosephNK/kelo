import { useQuery } from "@tanstack/react-query";
import type { UserStatus } from "@/domain/user/model";
import { UserRepository } from "./repository";

const repo = new UserRepository();

export const useUser = (id: string) =>
  useQuery({ queryKey: ["user", id], queryFn: () => repo.findById(id) });

export const useUsers = (status?: UserStatus) =>
  useQuery({ queryKey: ["users", status], queryFn: () => repo.list(status) });
