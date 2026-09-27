import { getUser } from "@/domain/user/service";
export default async function Page() {
  const user = await getUser("1");
  return <div>{user.email}</div>;
}
