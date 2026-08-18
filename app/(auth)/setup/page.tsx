import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { hasAnyUser, setupAction } from "@/actions/auth";

export default async function SetupPage() {
  // One account by design — once it exists, this page has nothing to offer.
  if (await hasAnyUser()) redirect("/login");

  return (
    <AuthForm
      action={setupAction}
      title="Create your account"
      subtitle="Forge is single-user. This account owns everything you build."
      submitLabel="Create account"
      footer="A demo workflow will be created so you have something to run."
    />
  );
}
