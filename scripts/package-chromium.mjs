import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptDir);
const chromiumEntryUrl = import.meta.resolve("@sparticuz/chromium");
const chromiumEntryPath = chromiumEntryUrl.replace(/^file:\/\//, "");
const chromiumBinDir = join(
  dirname(dirname(dirname(chromiumEntryPath))),
  "bin"
);
const publicDir = join(projectRoot, "public");
const outputPath = join(publicDir, "chromium-pack.tar");

if (!existsSync(chromiumBinDir)) {
  console.warn("Chromium binaries were not found; skipping archive creation.");
  process.exit(0);
}

mkdirSync(publicDir, { recursive: true });
execFileSync("tar", ["-cf", outputPath, "-C", chromiumBinDir, "."], {
  stdio: "inherit",
});

console.log(`Chromium archive created: ${outputPath}`);
