// Full click-through of the core flow against the running dev server (mock mode):
// signup -> onboarding (avatar upload) -> add listing -> generate script -> generate video -> completed.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3002";
const stamp = Date.now();
const email = `e2e_${stamp}@example.com`;

// A tiny 1x1 PNG to use as the avatar upload.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

let pass = 0,
  fail = 0;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  c ? pass++ : fail++;
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message));

try {
  // 1. Sign up
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.fill("#fullName", "Dana Agent");
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/onboarding", { timeout: 15000 });
  ok(true, "signup redirects to /onboarding");

  // 2. Avatar upload (photo) + optional voice clip
  await page.setInputFiles('input[name="file"]', {
    name: "headshot.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await page.setInputFiles('input[name="audio"]', {
    name: "voice.mp3",
    mimeType: "audio/mpeg",
    buffer: Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00]),
  });
  await page.click('button[type="submit"]:has-text("Create my avatar")');
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  ok(true, "avatar created -> redirects to /dashboard");

  // 3. Add a listing (manual)
  await page.goto(`${BASE}/listings/new`, { waitUntil: "networkidle" });
  await page.fill("#address", "123 Maple Court");
  await page.fill("#city", "Austin");
  await page.fill("#state", "TX");
  await page.fill("#price", "849000");
  await page.fill("#beds", "4");
  await page.fill("#baths", "3");
  await page.fill("#sqft", "2480");
  await page.fill(
    "#description",
    "Sun-filled open floor plan with a chef's kitchen and a large backyard.",
  );
  await page.fill("#features", "Pool, 2-car garage, Renovated kitchen");
  await page.click('button[type="submit"]:has-text("Save listing")');
  await page.waitForURL(/\/listings\/[0-9a-f-]+$/, { timeout: 15000 });
  ok(true, "listing saved -> listing detail page");
  ok(
    (await page.locator("text=$849,000").count()) > 0,
    "listing detail shows formatted price",
  );

  // 4. Generate video -> script page
  await page.click('button:has-text("Generate video")');
  await page.waitForURL(/\/videos\/[0-9a-f-]+$/, { timeout: 20000 });
  ok(true, "generate -> video page");
  await page.waitForSelector("textarea", { timeout: 10000 });
  const script = await page.inputValue("textarea");
  ok(script.length > 20, `script generated (${script.length} chars)`);
  ok(
    script.includes("Maple Court") || script.toLowerCase().includes("austin"),
    "script references the listing",
  );

  // 5. Submit to HeyGen (mock) and wait for completion
  await page.click('button:has-text("Generate video")');
  await page.waitForSelector("video", { timeout: 30000 });
  const src = await page.getAttribute("video", "src");
  ok(!!src, `video element rendered with src (${src?.slice(0, 40)}…)`);
  ok(
    (await page.locator("text=Download").count()) > 0,
    "Download action shown on completed video",
  );

  await page.screenshot({ path: "/tmp/realme-completed.png", fullPage: true });
  console.log("  screenshot -> /tmp/realme-completed.png");
} catch (e) {
  fail++;
  console.log("✗ flow threw:", e.message);
  await page.screenshot({ path: "/tmp/realme-error.png", fullPage: true }).catch(() => {});
  writeFileSync("/tmp/realme-page.html", await page.content().catch(() => ""));
} finally {
  await browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
