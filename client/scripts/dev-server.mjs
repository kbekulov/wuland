import { cpSync, existsSync, mkdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(scriptDir, "..");
const repoRoot = resolve(clientDir, "..");
const safeRoot = join(tmpdir(), "wuland-vite-root");
const safeClient = join(safeRoot, "client");
const viteBin = join(repoRoot, "node_modules", ".bin", "vite");
const passthroughArgs = process.argv.slice(2);

rmSync(safeRoot, { force: true, recursive: true });
mkdirSync(safeRoot, { recursive: true });

for (const entry of ["client", "shared", "server", "package.json", "package-lock.json"]) {
  const target = join(repoRoot, entry);

  if (!existsSync(target)) {
    continue;
  }

  const stats = statSync(target);

  if (stats.isDirectory()) {
    cpSync(target, join(safeRoot, entry), {
      filter: (source) => !source.endsWith("/dist") && !source.endsWith("/node_modules"),
      recursive: true
    });
  } else {
    cpSync(target, join(safeRoot, entry));
  }
}

if (existsSync(join(repoRoot, "node_modules"))) {
  symlinkSync(join(repoRoot, "node_modules"), join(safeRoot, "node_modules"), "dir");
}

const vite = spawn(viteBin, ["--host", "0.0.0.0", ...passthroughArgs], {
  cwd: safeClient,
  env: {
    ...process.env,
    WULAND_REAL_ROOT: repoRoot
  },
  stdio: "inherit"
});

vite.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
