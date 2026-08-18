import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";
import { hasAnyUser } from "@/actions/auth";

export default async function Root() {
  // First run has no account at all, so send people to setup rather than to a
  // login form they cannot possibly satisfy.
  if (!(await hasAnyUser())) redirect("/setup");
  redirect((await getSessionUserId()) ? "/today" : "/login");
}
