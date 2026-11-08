import { makeUserService } from "@/domain/user/service";

import { UserRepository } from "./repository";

export const createUserService = () => makeUserService(new UserRepository());
