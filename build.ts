import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const langArg = process.argv[2];

if (!langArg) {
	console.error("Error: Language argument is required");
	console.error("Usage: npm run build <language>");
	console.error("Example: npm run build javascript");
	process.exit(1);
}

const outDir = path.join(import.meta.dirname, "out");

/**
 * Find the root directory of a package by searching for package.json
 */
function findPackageRoot(startPath: string): string {
	let dir = startPath;
	while (true) {
		if (fs.existsSync(path.join(dir, "package.json"))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}
	throw new Error(`Could not find package root from ${startPath}`);
}

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
		} catch (error) {
			console.warn(
				`⚠️  Could not read or parse ${packageJsonPath}. Using default version.`,
				error,
			);
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

	fs.writeFileSync(
		treeSitterJsonPath,
		JSON.stringify(treeSitterConfig, null, 2),
	);
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
		const resolvedPath = import.meta.resolve(name);
		const filePath = fileURLToPath(resolvedPath);
		packagePath = findPackageRoot(path.dirname(filePath));
	} catch {
		packagePath = path.join(import.meta.dirname, "node_modules", name);
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
