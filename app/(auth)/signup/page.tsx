import { redirect } from "next/navigation";

// Magic-link sign-in handles both new and returning users.
export default function SignupPage() {
  redirect("/login");
}
