import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 820 } });
await p.goto("https://realme-kappa.vercel.app/", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: "/tmp/realme-prod.png" });
console.log("prod landing shot, title:", await p.title());
await b.close();
