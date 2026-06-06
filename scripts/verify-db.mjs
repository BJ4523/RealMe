// Ad-hoc verification of the signup trigger + RLS isolation against local Supabase.
// Reads keys from the environment — run with your .env.local loaded:
//   set -a; source .env.local; set +a; node scripts/verify-db.mjs
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !PUBLISHABLE || !SECRET) {
  console.error(
    "Missing Supabase env. Run: set -a; source .env.local; set +a; node scripts/verify-db.mjs",
  );
  process.exit(1);
}

const admin = createClient(URL, SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function anon() {
  return createClient(URL, PUBLISHABLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const stamp = Date.now();
const userA = { email: `a_${stamp}@example.com`, password: "password123" };
const userB = { email: `b_${stamp}@example.com`, password: "password123" };

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  cond ? pass++ : fail++;
};

const a = anon();
const b = anon();

const { data: signA, error: signAErr } = await a.auth.signUp(userA);
ok(!signAErr && !!signA.user, `user A signs up (${signAErr?.message ?? "ok"})`);
const { data: signB } = await b.auth.signUp(userB);
ok(!!signB.user, "user B signs up");

const aId = signA.user.id;
const bId = signB.user.id;

// Trigger created profiles?
const { data: profA } = await admin.from("profiles").select("*").eq("id", aId).maybeSingle();
ok(!!profA, "handle_new_user trigger created profile for A");
ok(profA?.email === userA.email, "profile A has correct email");
ok(profA?.onboarding_completed === false, "profile A starts un-onboarded");

// A inserts a listing (own user_id) — allowed.
const { data: listA, error: insErr } = await a
  .from("listings")
  .insert({ user_id: aId, address: "1 A Street", status: "active" })
  .select("id")
  .single();
ok(!insErr && !!listA, `A inserts own listing (${insErr?.message ?? "ok"})`);

// A inserts a listing as B's user_id — must be blocked by RLS WITH CHECK.
const { error: spoofErr } = await a
  .from("listings")
  .insert({ user_id: bId, address: "spoof", status: "active" });
ok(!!spoofErr, "A cannot insert a listing owned by B (RLS WITH CHECK)");

// B selects listings — must NOT see A's.
const { data: bSees } = await b.from("listings").select("*");
ok((bSees?.length ?? 0) === 0, "B cannot see A's listings (RLS SELECT isolation)");

// A selects listings — sees exactly its own.
const { data: aSees } = await a.from("listings").select("*");
ok((aSees?.length ?? 0) === 1, "A sees exactly its own listing");

// Cleanup
await admin.auth.admin.deleteUser(aId);
await admin.auth.admin.deleteUser(bId);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
