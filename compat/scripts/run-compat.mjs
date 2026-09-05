#!/usr/bin/env node
import { execSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const compatRoot = resolve(__dirname, "..");
const repoRoot = resolve(compatRoot, "..");
const templateRoot = join(compatRoot, "consumer");
const workspacesRoot = join(compatRoot, ".workspaces");
const packDir = join(workspacesRoot, "pack");

const matrix = JSON.parse(
  readFileSync(join(compatRoot, "matrix.json"), "utf8")
);

function parseArgs(argv) {
  const majors = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--major") {
      majors.push(Number(argv[++i]));
      continue;
    }
    if (arg.startsWith("--major=")) {
      majors.push(Number(arg.split("=")[1]));
      continue;
    }
    if (arg === "--all") {
      return matrix.majors.map((entry) => entry.major);
    }
  }
  return majors;
}

function run(command, options = {}) {
  execSync(command, {
    stdio: "inherit",
    ...options,
  });
}

function zoneVersionFor(angularVersion) {
  const major = Number(angularVersion.split(".")[0]);
  if (major <= 16) return "~0.13.3";
  if (major <= 18) return "~0.14.10";
  return "~0.15.0";
}

function createAngularJson(builder) {
  const buildTarget =
    builder === "browser"
      ? {
          builder: "@angular-devkit/build-angular:browser",
          options: {
            outputPath: "dist/consumer",
            index: "src/index.html",
            main: "src/main.ts",
            polyfills: ["zone.js"],
            tsConfig: "tsconfig.app.json",
          },
        }
      : {
          builder: "@angular-devkit/build-angular:application",
          options: {
            outputPath: "dist/consumer",
            index: "src/index.html",
            browser: "src/main.ts",
            polyfills: ["zone.js"],
            tsConfig: "tsconfig.app.json",
          },
        };

  const config = {
    $schema: "./node_modules/@angular/cli/lib/config/schema.json",
    version: 1,
    newProjectRoot: "projects",
    projects: {
      consumer: {
        projectType: "application",
        root: "",
        sourceRoot: "src",
        prefix: "app",
        architect: {
          build: buildTarget,
        },
      },
    },
  };

  if (builder === "browser") {
    config.defaultProject = "consumer";
  }

  return JSON.stringify(config, null, 2);
}

function createPackageJson(entry, tarballPath) {
  const angular = entry.angular;
  return JSON.stringify(
    {
      name: "signal-http-cache-compat-consumer",
      private: true,
      dependencies: {
        "@angular/common": angular,
        "@angular/compiler": angular,
        "@angular/core": angular,
        "@angular/platform-browser": angular,
        "@frontkit-ng/signal-http-cache": `file:${tarballPath}`,
        rxjs: "~7.8.0",
        tslib: "^2.3.0",
        "zone.js": zoneVersionFor(angular),
      },
      devDependencies: {
        "@angular-devkit/build-angular": angular,
        "@angular/cli": angular,
        "@angular/compiler-cli": angular,
        typescript: entry.typescript,
      },
    },
    null,
    2
  );
}

function packLibrary() {
  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(packDir, { recursive: true });
  run("npm run build", { cwd: repoRoot });
  const packOutput = execSync("npm pack --pack-destination compat/.workspaces/pack", {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const tarballName = packOutput.split("\n").pop();
  return join(packDir, tarballName);
}

function copyTemplate(workspaceDir) {
  cpSync(join(templateRoot, "src"), join(workspaceDir, "src"), {
    recursive: true,
  });
  cpSync(
    join(templateRoot, "tsconfig.json"),
    join(workspaceDir, "tsconfig.json")
  );
  cpSync(
    join(templateRoot, "tsconfig.app.json"),
    join(workspaceDir, "tsconfig.app.json")
  );

}

function runConsumer(entry, tarballPath) {
  const workspaceDir = join(workspacesRoot, `angular-${entry.major}`);
  rmSync(workspaceDir, { recursive: true, force: true });
  mkdirSync(workspaceDir, { recursive: true });

  copyTemplate(workspaceDir);

  const tsMajor = Number(entry.typescript.split(".")[0]);
  const tsconfigPath = join(workspaceDir, "tsconfig.json");
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  tsconfig.compilerOptions.moduleResolution = "bundler";
  if (tsMajor >= 6) {
    tsconfig.compilerOptions.ignoreDeprecations = "6.0";
  }
  writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

  const localTarball = join(workspaceDir, "pkg.tgz");
  cpSync(tarballPath, localTarball);
  writeFileSync(
    join(workspaceDir, "package.json"),
    createPackageJson(entry, "./pkg.tgz")
  );
  writeFileSync(
    join(workspaceDir, "angular.json"),
    createAngularJson(entry.builder)
  );

  console.log(`\n=== Angular ${entry.major} (${entry.angular}) ===`);
  console.log(
    `Node target: ${entry.node} | TypeScript: ${entry.typescript} | Builder: ${entry.builder}`
  );

  run("npm install --no-audit --no-fund", { cwd: workspaceDir });
  run("npx tsc -p tsconfig.app.json --noEmit", { cwd: workspaceDir });
  run("npx ng build consumer", { cwd: workspaceDir });

  return {
    major: entry.major,
    angular: entry.angular,
    node: entry.node,
    typescript: entry.typescript,
    install: "pass",
    typecheck: "pass",
    build: "pass",
    runtime: "not-run",
  };
}

function main() {
  const selectedMajors = parseArgs(process.argv.slice(2));
  const entries =
    selectedMajors.length === 0
      ? matrix.majors
      : matrix.majors.filter((entry) => selectedMajors.includes(entry.major));

  if (entries.length === 0) {
    console.error("No matrix entries selected. Use --major <n> or --all.");
    process.exit(1);
  }

  mkdirSync(workspacesRoot, { recursive: true });
  const tarballPath = packLibrary();
  const results = [];

  for (const entry of entries) {
    results.push(runConsumer(entry, tarballPath));
  }

  console.log("\n=== Compatibility summary ===");
  for (const result of results) {
    console.log(
      `Angular ${result.major} (${result.angular}): install=${result.install}, typecheck=${result.typecheck}, build=${result.build}`
    );
  }
}

main();
