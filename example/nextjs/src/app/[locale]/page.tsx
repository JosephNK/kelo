import { createUserService } from "@/http/user/factory";

export default async function Page() {
  const user = await createUserService().getUser("1");
  return <div>{user?.email}</div>;
}
