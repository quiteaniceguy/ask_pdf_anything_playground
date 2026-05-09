import puppeteer from "puppeteer";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Create minimal 1x1 PNG test images
function makePng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
}

const refPath = join(tmpdir(), "test_reference.png");
const drawPath = join(tmpdir(), "test_drawing.png");
writeFileSync(refPath, makePng());
writeFileSync(drawPath, makePng());

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });

// Confirm both drop zones exist
const refZone = await page.$('[data-testid="drop-reference"]');
const drawZone = await page.$('[data-testid="drop-drawing"]');

if (!refZone) throw new Error("FAIL: Reference drop zone not found");
if (!drawZone) throw new Error("FAIL: Drawing drop zone not found");

// Confirm labels are present
const refLabel = await page.evaluate(
  (el) => el.closest(".flex")?.querySelector("p.font-semibold")?.textContent,
  refZone
);
const drawLabel = await page.evaluate(
  (el) => el.closest(".flex")?.querySelector("p.font-semibold")?.textContent,
  drawZone
);

if (!refLabel?.includes("Reference")) throw new Error(`FAIL: Reference label wrong: "${refLabel}"`);
if (!drawLabel?.includes("Drawing")) throw new Error(`FAIL: Drawing label wrong: "${drawLabel}"`);

// Upload files to both zones
const refInput = await refZone.$("input[type=file]");
const drawInput = await drawZone.$("input[type=file]");
await refInput.uploadFile(refPath);
await drawInput.uploadFile(drawPath);

// Confirm previews appear (object URLs render as img tags)
await page.waitForSelector('[data-testid="drop-reference"] img', { timeout: 3000 });
await page.waitForSelector('[data-testid="drop-drawing"] img', { timeout: 3000 });

await browser.close();
console.log("PASS — both drop zones present, labeled correctly, and accept file uploads");
