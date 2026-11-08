import { useQuery } from "@tanstack/react-query";
import type { UserStatus } from "@/domain/user/model";
import { createUserService } from "./factory";

const service = createUserService();

export const useUser = (id: string) =>
  useQuery({ queryKey: ["user", id], queryFn: () => service.getUser(id) });

export const useUsers = (status?: UserStatus) =>
  useQuery({ queryKey: ["users", status], queryFn: () => service.listUsers(status) });
