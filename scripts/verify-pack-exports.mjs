#!/usr/bin/env node
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

function run(command, cwd) {
  execSync(command, { cwd, stdio: "pipe" });
}

const packDir = mkdtempSync(join(tmpdir(), "signal-http-cache-pack-out-"));
const packOutput = execSync(`npm pack --pack-destination "${packDir}"`, {
  cwd: repoRoot,
  encoding: "utf8",
});
const tarballName = packOutput.trim().split("\n").pop();
const tarball = join(packDir, tarballName);
const extractDir = join(packDir, "extracted");
run(`mkdir -p "${extractDir}"`, repoRoot);
execSync(`tar -xzf "${tarball}" -C "${extractDir}"`, { stdio: "inherit" });

const packageRoot = join(extractDir, "package");
const pkgJson = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8")
);

if (!pkgJson.exports?.["./http-client"]) {
  throw new Error("packed package.json missing ./http-client export");
}

const httpClientJs = join(packageRoot, "dist/http-client/index.js");
if (!existsSync(httpClientJs)) {
  throw new Error(`missing packed artifact: ${httpClientJs}`);
}

const consumerDir = mkdtempSync(join(tmpdir(), "signal-http-cache-consumer-"));
writeFileSync(
  join(consumerDir, "package.json"),
  JSON.stringify(
    {
      name: "pack-export-consumer",
      private: true,
      type: "module",
      dependencies: {
        "@frontkit-ng/signal-http-cache": `file:${tarball}`,
      },
    },
    null,
    2
  )
);
run("npm install --no-audit --no-fund", consumerDir);

const consumerRequire = createRequire(join(consumerDir, "package.json"));
const resolvedRoot = consumerRequire.resolve("@frontkit-ng/signal-http-cache");
const resolvedHttpClient = consumerRequire.resolve(
  "@frontkit-ng/signal-http-cache/http-client"
);
if (!existsSync(resolvedRoot) || !existsSync(resolvedHttpClient)) {
  throw new Error("packed export map must resolve root and http-client entry points");
}
let internalBlocked = false;
try {
  consumerRequire.resolve(
    "@frontkit-ng/signal-http-cache/internal/query-http-executor-token"
  );
} catch {
  internalBlocked = true;
}
if (!internalBlocked) {
  throw new Error(
    "undeclared internal subpath must be rejected by package exports"
  );
}

const consumerRoot = join(
  consumerDir,
  "node_modules",
  "@frontkit-ng",
  "signal-http-cache"
);
const rootDts = readFileSync(join(consumerRoot, "dist/index.d.ts"), "utf8");
if (rootDts.includes("LoaderQueryOptions")) {
  throw new Error("packed root declarations must not export LoaderQueryOptions");
}
if (rootDts.includes("FetchQueryOptions")) {
  throw new Error("packed root declarations must not export FetchQueryOptions");
}

rmSync(packDir, { recursive: true, force: true });
rmSync(consumerDir, { recursive: true, force: true });
console.log("pack export verification passed");
