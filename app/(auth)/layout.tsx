import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/shared/logo";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Already signed in? There's nothing to do on /login or /signup — go to the
  // app. (Kills the "I went to sign in again" confusion; route handlers like
  // /auth/callback don't render layouts, so this only guards the pages.)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/app");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="mb-8">
        <Logo className="text-2xl" />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
