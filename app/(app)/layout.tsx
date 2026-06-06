import { AppNav } from "@/components/shared/app-nav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { email } = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <AppNav email={email} />
      <main className="flex-1 pb-24 md:pb-0">
        <div className="mx-auto w-full max-w-5xl px-5 py-8">{children}</div>
      </main>
    </div>
  );
}
