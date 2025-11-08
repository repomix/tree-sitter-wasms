import fs from "node:fs";
import path from "node:path";
import util from "node:util";

const findRoot = require("find-root");

const langArg = process.argv[2];

if (!langArg) {
	console.error("Error: Language argument is required");
	console.error("Usage: npm run build <language>");
	console.error("Example: npm run build javascript");
	process.exit(1);
}

const execFile = util.promisify(require("node:child_process").execFile);

const outDir = path.join(__dirname, "out");

function ensureTreeSitterJson(packagePath: string, packageName: string) {
	const treeSitterJsonPath = path.join(packagePath, "tree-sitter.json");
	if (fs.existsSync(treeSitterJsonPath)) {
		return; // File already exists
	}

	// Extract language name from package name (e.g., "tree-sitter-dart" -> "dart")
	const langName = packageName.replace(/^tree-sitter-/, "");
	const capitalizedLangName =
		langName.charAt(0).toUpperCase() + langName.slice(1);

	// Read version from package.json if available
	let version = "1.0.0";
	const packageJsonPath = path.join(packagePath, "package.json");
	if (fs.existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
			version = packageJson.version || version;
		} catch {
			// Use default version if package.json is not readable
		}
	}

	// Create minimal tree-sitter.json
	const treeSitterConfig = {
		grammars: [
			{
				name: langName,
				camelcase: capitalizedLangName,
				scope: `source.${langName}`,
				path: ".",
				"file-types": [langName],
			},
		],
		metadata: {
			version,
			license: "MIT",
		},
	};

	fs.writeFileSync(treeSitterJsonPath, JSON.stringify(treeSitterConfig, null, 2));
	console.log(`📝 Created tree-sitter.json for ${packageName}`);
}

async function buildParserWASM(
	name: string,
	{ subPath, generate }: { subPath?: string; generate?: boolean } = {},
) {
	const label = subPath ? path.join(name, subPath) : name;
	console.log(`⏳ Building ${label}`);
	let packagePath: string;
	try {
		packagePath = findRoot(require.resolve(name));
	} catch {
		packagePath = path.join(__dirname, "node_modules", name);
	}
	const cwd = subPath ? path.join(packagePath, subPath) : packagePath;

	// Ensure tree-sitter.json exists before building
	ensureTreeSitterJson(cwd, name);

	if (generate) {
		await execFile("npx", ["tree-sitter", "generate"], { cwd });
	}
	await execFile("npx", ["tree-sitter", "build", "--wasm", cwd]);
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
		} else if (
			[
				"tree-sitter-dart",
				"tree-sitter-solidity",
				"tree-sitter-swift",
				"tree-sitter-vue",
			].includes(packageName)
		) {
			// These packages are installed from GitHub and need grammar generation
			await buildParserWASM(packageName, { generate: true });
		} else {
			await buildParserWASM(packageName);
		}
	} catch (e) {
		console.error(`🔥 Build failed:\n`, e);
		process.exit(1);
	}
})();
