import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Copy a real desktop image to use for testing
const testImages = execSync(`python3 -c "
import glob, os, re
files = glob.glob(os.path.expanduser('~/Desktop/Screenshot*2026-05-08*'))
for f in files:
    clean = re.sub(r'\\\\s+', '_', os.path.basename(f))
    dest = f'/tmp/ui_test_{clean}'
    import shutil; shutil.copy2(f, dest)
    print(dest)
"`).toString().trim().split("\n");

const testImage = testImages[0];
console.log("Using test image:", testImage);

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

await page.goto("http://localhost:3000", { waitUntil: "networkidle0" });
await page.screenshot({ path: "/tmp/loop_1_initial.png" });
console.log("Screenshot 1: initial page");

const inputEl = await page.$("input[type=file]");
await inputEl.uploadFile(testImage);

// Show processing state
await page.waitForSelector("p.text-gray-500", { timeout: 5000 }).catch(() => {});
await page.screenshot({ path: "/tmp/loop_2_processing.png" });
console.log("Screenshot 2: processing");

// Wait for result or error (up to 90s for YOLO inference)
await page.waitForSelector("img[alt='Person with background removed'], p.text-red-500", {
  timeout: 90000,
});
await page.screenshot({ path: "/tmp/loop_3_result.png" });
console.log("Screenshot 3: result");

// Check if we got an error
const errText = await page.$eval("p.text-red-500", el => el.textContent).catch(() => null);
if (errText) {
  console.error("ERROR on page:", errText);
  process.exit(1);
}

await browser.close();
console.log("PASS — screenshots at /tmp/loop_1_initial.png /tmp/loop_2_processing.png /tmp/loop_3_result.png");
