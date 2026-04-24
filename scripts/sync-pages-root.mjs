import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(repoRoot, "client", "dist");
const rootAssetsDir = join(repoRoot, "assets");

if (!existsSync(join(distDir, "index.html"))) {
  throw new Error("client/dist/index.html is missing. Run npm run build first.");
}

rmSync(rootAssetsDir, { force: true, recursive: true });
mkdirSync(rootAssetsDir, { recursive: true });

cpSync(join(distDir, "index.html"), join(repoRoot, "index.html"));
cpSync(join(distDir, "assets"), rootAssetsDir, { recursive: true });
cpSync(join(repoRoot, "CNAME"), join(distDir, "CNAME"));

console.log("Synced client/dist to repository root for branch-based GitHub Pages.");
