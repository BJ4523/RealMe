import { Logo } from "@/components/shared/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="mb-8">
        <Logo className="text-2xl" />
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
