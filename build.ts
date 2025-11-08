import fs from "fs";
import os from "os";
import path from "path";
import util from "util";

import { PromisePool } from "@supercharge/promise-pool";
const findRoot = require("find-root");

import packageInfo from "./package.json";

const langArg = process.argv[2];

const exec = util.promisify(require("child_process").exec);

const outDir = path.join(__dirname, "out");

let hasErrors = false;

async function buildParserWASM(
  name: string,
  { subPath, generate }: { subPath?: string; generate?: boolean } = {}
) {
  const label = subPath ? path.join(name, subPath) : name;
  try {
    console.log(`⏳ Building ${label}`);
    let packagePath;
    try {
      packagePath = findRoot(require.resolve(name));
    } catch (_) {
      packagePath = path.join(__dirname, "node_modules", name);
    }
    const cwd = subPath ? path.join(packagePath, subPath) : packagePath;
    if (generate) {
      await exec(`pnpm tree-sitter generate`, { cwd });
    }
    await exec(`pnpm tree-sitter build-wasm ${cwd}`);
    console.log(`✅ Finished building ${label}`);
  } catch (e) {
    console.error(`🔥 Failed to build ${label}:\n`, e);
    hasErrors = true;
  }
}

// Ensure output directory exists (don't delete if it exists, for parallel builds)
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

process.chdir(outDir);

// Normalize language argument to package name
const targetPackage = langArg
  ? langArg.startsWith("tree-sitter-")
    ? langArg
    : `tree-sitter-${langArg}`
  : null;

const grammars = Object.keys(packageInfo.devDependencies)
  .filter((n) => n.startsWith("tree-sitter-") && n !== "tree-sitter-cli")
  .filter((s) => !targetPackage || s === targetPackage);

PromisePool.withConcurrency(os.cpus().length)
  .for(grammars)
  .process(async (name) => {
    if (name == "tree-sitter-php") {
      await buildParserWASM(name, { subPath: "php" });
    } else if (name == "tree-sitter-typescript") {
      await buildParserWASM(name, { subPath: "typescript" });
      await buildParserWASM(name, { subPath: "tsx" });
    } else {
      await buildParserWASM(name);
    }
  })
  .then(async () => {
    if (hasErrors) {
      process.exit(1);
    }
    await exec(`mv *.wasm ${outDir}`, { cwd: __dirname });
  });
