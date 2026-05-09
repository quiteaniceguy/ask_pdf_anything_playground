import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, unlink } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("image") as File;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ts = Date.now();
  const inputPath = path.join(os.tmpdir(), `rmbg_in_${ts}.png`);
  const outputPath = path.join(os.tmpdir(), `rmbg_out_${ts}.png`);

  try {
    await writeFile(inputPath, buffer);

    const scriptPath = path.join(process.cwd(), "scripts", "remove_bg.py");
    await execAsync(`python3 "${scriptPath}" "${inputPath}" "${outputPath}"`);

    const result = await readFile(outputPath);
    return NextResponse.json({
      image: `data:image/png;base64,${result.toString("base64")}`,
    });
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
