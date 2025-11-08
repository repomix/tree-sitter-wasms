import fs from "fs";
import path from "path";
import util from "util";

const findRoot = require("find-root");

const langArg = process.argv[2];

if (!langArg) {
  console.error("Error: Language argument is required");
  console.error("Usage: pnpm build <language>");
  console.error("Example: pnpm build javascript");
  process.exit(1);
}

const exec = util.promisify(require("child_process").exec);

const outDir = path.join(__dirname, "out");

async function buildParserWASM(
  name: string,
  { subPath, generate }: { subPath?: string; generate?: boolean } = {}
) {
  const label = subPath ? path.join(name, subPath) : name;
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
}

// Ensure output directory exists (don't delete if it exists, for parallel builds)
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

process.chdir(outDir);

// Normalize language argument to package name
const packageName = langArg.startsWith("tree-sitter-")
  ? langArg
  : `tree-sitter-${langArg}`;

(async () => {
  try {
    if (packageName === "tree-sitter-php") {
      await buildParserWASM(packageName, { subPath: "php" });
    } else if (packageName === "tree-sitter-typescript") {
      await buildParserWASM(packageName, { subPath: "typescript" });
      await buildParserWASM(packageName, { subPath: "tsx" });
    } else {
      await buildParserWASM(packageName);
    }
    await exec(`mv *.wasm ${outDir}`, { cwd: __dirname });
  } catch (e) {
    console.error(`🔥 Build failed:\n`, e);
    process.exit(1);
  }
})();
