/**
 * How Solid's TSX is compiled for this package, on Bun (`./plugin`) and on Node.js (`./register`):
 * Solid's own compiler (`@solidjs/compiler`), in its universal mode, for the renderer of
 * `@decky.fx/raven-tsx/solid/renderer`. Only the JSX is compiled: the types stay, for the runtime
 * to take away.
 */

import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The major version of Solid this package is written for: its renderer, its compiler. */
export const SOLID_MAJOR = 2;

/**
 * A package as it is installed: its version, the folder that holds it, and the folder it was
 * resolved from (the project that uses it: with pnpm, the folder that holds it is in a store that
 * several projects share).
 */
export interface InstalledPackage {
	readonly version: string;
	readonly folder: string;
	readonly from: string;
}

/**
 * The versions of Solid's packages that an application has (a version, or the installed package,
 * whose folder the message then names), each missing when it is not there: `solid-js`, the
 * renderer's factory `@solidjs/universal`, and the compiler `@solidjs/compiler`.
 */
export interface SolidVersions {
	readonly solid?: string | InstalledPackage | undefined;
	readonly universal?: string | InstalledPackage | undefined;
	readonly compiler?: string | InstalledPackage | undefined;
}

/** The version of a package as `SolidVersions` holds it. */
const versionOf = (found: string | InstalledPackage): string => (typeof found === "string" ? found : found.version);

/**
 * What is wrong with these versions of Solid, or nothing. Solid 1 has its renderer elsewhere
 * (`solid-js/universal`) and another compiler (Babel's): with it, an application fails at its
 * first import with "Cannot find module", which does not say why.
 */
export function solidVersionProblem(versions: SolidVersions): string | undefined {
	// (each with the folder it is in, when known: in a workspace, the project to change is the one
	// that installs it; and only the command for what is wrong, as the compiler may be in another.
	// The compiler within its minor: what it compiles to must be what the renderer exports)
	const install = {
		"solid-js": `npm install solid-js@${SOLID_MAJOR} (bun add solid-js@${SOLID_MAJOR})`,
		"@solidjs/universal": `npm install @solidjs/universal@${SOLID_MAJOR} (bun add @solidjs/universal@${SOLID_MAJOR})`,
		"@solidjs/compiler": `npm install -D @solidjs/compiler@~${SOLID_MAJOR}.0.2 (bun add -d @solidjs/compiler@~${SOLID_MAJOR}.0.2)`,
	} as const;
	const found: string[] = [];
	const commands: string[] = [];
	let solid1 = false;
	const packages = [["solid-js", versions.solid], ["@solidjs/universal", versions.universal], ["@solidjs/compiler", versions.compiler]] as const;
	for (const [name, installed] of packages) {
		if (installed === undefined) {
			continue;
		}
		const major = Number.parseInt(versionOf(installed), 10);
		if (major !== SOLID_MAJOR) {
			found.push(`${name} ${versionOf(installed)}${typeof installed === "string" ? "" : ` (resolved from ${installed.from}, installed in ${installed.folder})`}`);
			commands.push(install[name]);
			solid1 ||= major === 1;
		}
	}
	if (found.length === 0) {
		return undefined;
	}
	return (
		`raven-tsx: @decky.fx/raven-tsx/solid supports Solid ${SOLID_MAJOR}, not ${found.join(" and ")}. ` +
		`Install Solid ${SOLID_MAJOR} in the project of the folder it is resolved from, or update the dependency that brings that copy: ${commands.join("; ")}.` +
		// (an application staying on Solid 1 has the version of this package that is written for it)
		(solid1 ? " For Solid 1, use raven-tsx 0.3.x: npm install @decky.fx/raven-tsx@0.3 (bun add @decky.fx/raven-tsx@0.3)." : "")
	);
}

/** This package's folder of Solid, where its renderer and loaders resolve their packages from. */
const HERE = dirname(fileURLToPath(import.meta.url));

/** Where a package's entry point is: from this package by default, the copy its renderer and loaders import. */
const fromHere = (name: string): string => fileURLToPath(import.meta.resolve(name));

/**
 * A package as it is installed where `resolveEntry` resolves its entry point, from the folder `from`
 * (this package by default), or nothing when it is not installed there.
 */
export function installedPackage(name: string, resolveEntry: (name: string) => string = fromHere, from: string = HERE): InstalledPackage | undefined {
	let path: string;
	try {
		path = resolveEntry(name);
	} catch {
		return undefined;
	}
	// (the package.json of the package, above the file its entry point resolves to)
	for (let folder = dirname(path); folder !== dirname(folder); folder = dirname(folder)) {
		try {
			const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { readonly name?: unknown; readonly version?: unknown };
			if (manifest.name === name && typeof manifest.version === "string") {
				return { version: manifest.version, folder, from };
			}
		} catch {
			// (no package.json in this folder: the one above)
		}
	}
	return undefined;
}

/** The name of the package a file is in: that of the nearest package.json above it that has one. */
export function packageNameOf(path: string): string | undefined {
	for (let folder = dirname(path); folder !== dirname(folder); folder = dirname(folder)) {
		try {
			const manifest = JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { readonly name?: unknown };
			if (typeof manifest.name === "string") {
				return manifest.name;
			}
		} catch {
			// (no package.json here, or one that does not parse: the one above)
		}
	}
	return undefined;
}

/** Whether a file is the renderer of this package, wherever it is installed (a link to a folder of another name too). */
export function isRendererFile(path: string): boolean {
	return /[\\/]solid[\\/]renderer\.[cm]?[jt]s$/.test(path) && packageNameOf(path) === RENDERER.split("/solid/")[0];
}

/** The version of a package where `resolveEntry` finds it, as `installedPackage` does. */
export function installedVersion(name: string, resolveEntry?: (name: string) => string): string | undefined {
	return installedPackage(name, resolveEntry)?.version;
}

/** What compiled TSX imports: the renderer of this package (see `solidCompiler`). */
export const RENDERER = "@decky.fx/raven-tsx/solid/renderer";

/**
 * The folder an application's packages are resolved from: that of its entry file when the runtime
 * gives one that exists (`Bun.main`, `process.argv[1]`), that of the main file of a folder given as
 * the entry (`node apps/web`), else the working directory. An entry that is a link counts where it
 * leads, unless `preserveSymlinks`. Run from the root of a
 * workspace, the entry's folder may see another solid-js than the root.
 */
export function applicationFolder(entry: string | undefined, cwd: string, preserveSymlinks = false): string {
	if (!entry || !isAbsolute(entry)) {
		return cwd;
	}
	try {
		const found = statSync(entry, { throwIfNoEntry: false });
		if (!found) {
			return cwd;
		}
		if (!found.isDirectory()) {
			// (the file a link leads to: the one that runs, and resolves its imports from its own folder,
			// unless the runtime is told to keep the link, as --preserve-symlinks-main tells Node.js)
			return dirname(preserveSymlinks ? entry : realpathSync(entry));
		}
		// (a folder runs its main file, which may be deeper and see other packages: `dist/index.cjs`.
		// Under its own path when the runtime keeps links, else where they lead)
		const main = folderMain(entry);
		return main === undefined ? entry : dirname(preserveSymlinks ? main : realpathSync(main));
	} catch {
		// (an entry that cannot be looked at, as a loop of links: the working directory)
		return cwd;
	}
}

/**
 * The file Node.js runs for a folder, under the folder's own path (links kept), as its documented
 * steps go: `main` of its package.json, with `.js`, as a folder with `index.js`, then the folder's
 * own `index.js`. Only files of JavaScript: an application is not `.json` or `.node`.
 */
function folderMain(folder: string): string | undefined {
	let main: unknown;
	try {
		main = (JSON.parse(readFileSync(join(folder, "package.json"), "utf8")) as { readonly main?: unknown }).main;
	} catch {
		main = undefined;
	}
	// (resolved once against the folder, as Node.js does: an absolute main stays itself, and `dist/`
	// is `dist`, whose `dist.js` comes before `dist/index.js`)
	const base = typeof main === "string" && main !== "" ? resolve(folder, main) : undefined;
	const candidates = base === undefined ? [] : [base, `${base}.js`, join(base, "index.js")];
	return [...candidates, join(folder, "index.js")].find(isFile);
}

/** Whether a path is a file; not when it cannot be looked at (a loop of links), so the next candidate is tried. */
function isFile(path: string): boolean {
	try {
		return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
	} catch {
		return false;
	}
}

/** Whether Node.js keeps the link of its main file: `--preserve-symlinks-main` on its command line or in NODE_OPTIONS. */
export function preservesSymlinksMain(execArgv: readonly string[], nodeOptions: string | undefined): boolean {
	const flag = "--preserve-symlinks-main";
	return execArgv.includes(flag) || nodeOptionsWords(nodeOptions ?? "").includes(flag);
}

/**
 * The words of NODE_OPTIONS as Node.js reads them (`ParseNodeOptionsEnvVar`): split at spaces (only
 * ' '), outside double quotes, which only open and close a quoted part, and in which a backslash
 * keeps the character after it.
 */
export function nodeOptionsWords(options: string): string[] {
	const words: string[] = [];
	let quoted = false;
	let newWord = true;
	for (let index = 0; index < options.length; index++) {
		let character = options.charAt(index);
		if (character === "\\" && quoted && index + 1 < options.length) {
			character = options.charAt(++index);
		} else if (character === " " && !quoted) {
			newWord = true;
			continue;
		} else if (character === '"') {
			quoted = !quoted;
			continue;
		}
		if (newWord) {
			words.push(character);
			newWord = false;
		} else {
			words[words.length - 1] += character;
		}
	}
	return words;
}

/** Stops, saying why, when these versions of Solid are not those this package is written for. */
export function assertSolidVersion(versions: SolidVersions): void {
	const problem = solidVersionProblem(versions);
	if (problem) {
		throw new Error(problem);
	}
}

/** The files compiled by default: `.tsx` and `.jsx`, but those of node_modules, which come compiled. */
export const SOURCES = /^(?!.*[\\/]node_modules[\\/]).*\.[jt]sx$/;

/** Whether a file is TypeScript, whose types the runtime takes away after Solid's compiler. */
export const isTypeScript = (path: string): boolean => /\.tsx$/.test(path);

/** What Solid's compiler gives for a source: the code, TSX staying TypeScript, and its source map. */
export interface SolidOutput {
	readonly code: string;
	/** The source map (version 3, JSON), when the compiler gave one. */
	readonly map: string | null;
}

/** Compiles the JSX of a source for Solid, given its path. */
export type SolidCompile = (source: string, path: string) => SolidOutput;

/**
 * Loads Solid's compiler, and returns what compiles a source with it: its JSX becomes calls of this
 * package's renderer, its types stay.
 */
export async function solidCompiler(): Promise<SolidCompile> {
	// (loaded once the versions are checked, and only then: an application of React never needs it)
	const { transform } = await import("@solidjs/compiler");
	return (source, path) => {
		const { code, map } = transform(source, { filename: path, generate: "universal", moduleName: RENDERER, sourceMap: true });
		return { code, map: map ?? null };
	};
}

/** The code with its source map inline at the end, which Node.js reads (`--enable-source-maps`): an error says the line of the source. */
export function withInlineMap({ code, map }: SolidOutput): string {
	return map ? `${code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(map).toString("base64")}\n` : code;
}
