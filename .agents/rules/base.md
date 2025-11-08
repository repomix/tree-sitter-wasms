## Project Overview

This repository builds prebuilt WASM binaries for tree-sitter language parsers. It's forked from [tree-sitter-wasms](https://github.com/Gregoor/tree-sitter-wasms) and maintained specifically for Repomix, including only the languages needed for that project.

The supported languages are defined in `package.json` as `devDependencies` starting with `tree-sitter-*` (excluding `tree-sitter-cli`).

## Commands

### Build
```bash
# Build a specific language (required argument)
npm run build <language>

# Examples:
npm run build javascript
npm run build rust
npm run build typescript
```

The build script accepts either short names (`javascript`) or full package names (`tree-sitter-javascript`).

### Lint
```bash
npm run lint              # Run all linters (biome, oxlint, tsgo)
npm run lint-biome        # Biome formatter/linter with auto-fix
npm run lint-oxlint       # Oxlint with auto-fix
npm run lint-ts           # TypeScript type checking only (no emit)
```

## Architecture

### Build System

The build process is orchestrated by [build.ts](build.ts), which:

1. Takes a language name as a required CLI argument
2. Resolves the package path using `find-root`
3. Runs `tree-sitter build-wasm` to generate WASM binaries
4. Outputs to the `out/` directory

### Language Categories

Languages are handled differently based on their source:

1. **Standard languages** (from npm): Built directly with `tree-sitter build-wasm`
   - Examples: c, c-sharp, cpp, css, go, java, javascript, python, ruby, rust

2. **Languages from GitHub** (require grammar generation):
   - `tree-sitter-dart`
   - `tree-sitter-solidity`
   - `tree-sitter-swift`
   - `tree-sitter-vue`

   These run `tree-sitter generate` first to create `grammar.json` before building WASM.

3. **Special cases**:
   - `tree-sitter-php`: Uses `subPath: "php"` (grammar is in php subdirectory)
   - `tree-sitter-typescript`: Builds two parsers - `typescript` and `tsx`

### CI/CD Architecture

GitHub Actions workflows ([.github/workflows/](.github/workflows/)) use a matrix strategy:

1. **Setup job**: Extracts language list from `package.json` dynamically
2. **Build job**: Runs in parallel for each language, uploads WASM artifacts
3. **Verify/Publish job**: Downloads all artifacts and publishes to npm

This parallel approach significantly reduces build time compared to sequential builds.

### npm Configuration

The project uses npm with special configuration in [.npmrc](.npmrc):
- `ignore-scripts=true`: Prevents native module builds (only WASM needed)
- `legacy-peer-deps=true`: Resolves tree-sitter version conflicts between packages

Some tree-sitter packages are installed from GitHub and have peer dependency conflicts, but this doesn't affect WASM builds.

## Node.js and TypeScript

- **Node.js**: Version 24 (specified in workflows)
- **TypeScript**: Configured for Node.js 24 with ES2024 target and `nodenext` module resolution
- The build script uses CommonJS with ts-node for execution
