// Reliable local login WITHOUT email/SMTP. Uses the service-role key to mint an
// OTP + magic-link token via the Supabase Admin API, so you can log into
// localhost instantly. Usage:
//   node scripts/dev-login.mjs [email]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const site = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
if (!url || !key) throw new Error("Missing SUPABASE url/service-role key in .env.local");

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

let email = process.argv[2];
if (!email) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 50 });
  if (error) throw error;
  const users = data.users.map((u) => u.email).filter(Boolean);
  if (users.length === 0) throw new Error("No users found — pass an email to create one.");
  console.log("Users in this project:");
  users.forEach((e) => console.log("  -", e));
  email = users[0];
  console.log(`\nNo email arg given — using: ${email}\n`);
}

const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (error) throw error;
const p = data.properties;

console.log("=".repeat(60));
console.log(`Login for: ${email}`);
console.log("=".repeat(60));
console.log(`\n  6-digit code (type it in the login form): ${p.email_otp}\n`);
console.log("  …or open this URL on localhost to log in directly:");
console.log(`  ${site}/auth/confirm?token_hash=${p.hashed_token}&type=${p.verification_type}&next=/app\n`);
console.log("(Tokens expire in ~1 hour. Re-run for a fresh one.)");
