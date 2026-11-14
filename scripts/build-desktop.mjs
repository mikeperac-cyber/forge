import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const node22Dir = fs
  .readdirSync(path.join(root, ".node22"))
  .find((d) => /^node-v22.*-win-x64$/.test(d));
if (!node22Dir) {
  console.error(
    "Extract a Node 22 win-x64 zip into .node22/ first (isolated-vm prebuilds target ABI 127).",
  );
  process.exit(1);
}
const node22 = path.join(root, ".node22", node22Dir, "node.exe");

function run(exe, args, env = {}) {
  const r = spawnSync(exe, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Turbopack requires external packages under a hashed alias
// ("@prisma/client-<16hex>") that standalone tracing never writes into
// node_modules, so the bundled server crashes on first DB access. Copy each
// real package to its hashed alias so the sidecar resolves offline.
function materializeExternalAliases(serverDir) {
  const nm = path.join(serverDir, "node_modules");
  const aliases = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|mjs)$/.test(e.name)) {
        const src = fs.readFileSync(p, "utf8");
        for (const m of src.matchAll(
          /["']((?:@[^/"']+\/)?[^/"']+)-([0-9a-f]{16})(?:\/[^"']*)?["']/g,
        )) {
          aliases.add(`${m[1]}-${m[2]}`);
        }
      }
    }
  };
  walk(path.join(serverDir, ".next", "server"));
  for (const alias of aliases) {
    const base = alias.slice(0, -17);
    const src = path.join(nm, base);
    const dst = path.join(nm, alias);
    if (!fs.existsSync(src) || fs.existsSync(dst)) continue;
    fs.cpSync(src, dst, { recursive: true });
    console.log("external alias:", alias, "->", base);
  }
}

console.log("== next build (standalone) ==");
run(node22, ["node_modules/next/dist/bin/next", "build"]);

console.log("== clean template db ==");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forge-template-"));
const dbUrl = "file:" + path.join(tmp, "forge.db").replaceAll("\\", "/");
run(node22, ["node_modules/prisma/build/index.js", "db", "push"], {
  DATABASE_URL: dbUrl,
});
run(node22, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], {
  DATABASE_URL: dbUrl,
});

console.log("== stage sidecar ==");
const sidecar = path.join(root, "src-tauri", "sidecar");
fs.rmSync(sidecar, { recursive: true, force: true });
fs.mkdirSync(path.join(sidecar, "node"), { recursive: true });
fs.mkdirSync(path.join(sidecar, "template"), { recursive: true });
fs.copyFileSync(node22, path.join(sidecar, "node", "node.exe"));
fs.cpSync(
  path.join(root, ".next", "standalone"),
  path.join(sidecar, "server"),
  { recursive: true },
);
fs.cpSync(
  path.join(root, ".next", "static"),
  path.join(sidecar, "server", ".next", "static"),
  { recursive: true },
);
fs.cpSync(path.join(root, "public"), path.join(sidecar, "server", "public"), {
  recursive: true,
});
materializeExternalAliases(path.join(sidecar, "server"));
fs.copyFileSync(
  path.join(tmp, "forge.db"),
  path.join(sidecar, "template", "forge.db"),
);
fs.rmSync(tmp, { recursive: true, force: true });

console.log("== tauri build ==");
run(process.execPath, ["node_modules/@tauri-apps/cli/tauri.js", "build"]);

const nsis = path.join(
  root,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis",
);
for (const f of fs.readdirSync(nsis))
  console.log("installer:", path.join(nsis, f));
