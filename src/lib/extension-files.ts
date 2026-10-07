/** Tệp cài đặt tiện ích (chỉ quản trị viên tải) – do scripts/build-extension.mjs tạo trong private/downloads */
import fs from "node:fs";
import path from "node:path";

export const EXT_DIR = () => path.join(process.cwd(), "private", "downloads");

export function extensionInfo(): { version: string; file: string; builtAt: string } | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(EXT_DIR(), "san-deal-extension.json"), "utf8"));
  } catch {
    return null;
  }
}

export const extensionZipPath = () => path.join(EXT_DIR(), "san-deal-extension.zip");
