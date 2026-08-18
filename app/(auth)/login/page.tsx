import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { hasAnyUser, loginAction } from "@/actions/auth";
import { getSessionUserId } from "@/lib/session";

export default async function LoginPage() {
  if (!(await hasAnyUser())) redirect("/setup");
  if (await getSessionUserId()) redirect("/workflows");

  return (
    <AuthForm
      action={loginAction}
      title="Sign in"
      subtitle="Forge runs locally on this machine."
      submitLabel="Sign in"
    />
  );
}
