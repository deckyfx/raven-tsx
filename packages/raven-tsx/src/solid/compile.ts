/// <reference path="./babel-preset-solid.d.ts" />
/**
 * How Solid's TSX is compiled for this package, on Bun (`./plugin`) and on Node.js (`./register`):
 * Babel with `babel-preset-solid`, in its universal mode, for the renderer of
 * `@decky.fx/raven-tsx/solid/renderer`. Only the JSX is compiled: the types stay, for the runtime
 * to take away.
 */

import type { PluginItem, TransformOptions } from "@babel/core";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The major version of Solid this package is written for: its renderer, its compiler. */
export const SOLID_MAJOR = 1;

/** A package as it is installed: its version, and the folder that holds it. */
export interface InstalledPackage {
	readonly version: string;
	readonly folder: string;
}

/**
 * The versions of Solid's packages that an application has (a version, or the installed package,
 * whose folder the message then names), each missing when it is not there.
 */
export interface SolidVersions {
	readonly solid?: string | InstalledPackage | undefined;
	readonly preset?: string | InstalledPackage | undefined;
}

/** The version of a package as `SolidVersions` holds it. */
const versionOf = (found: string | InstalledPackage): string => (typeof found === "string" ? found : found.version);

/**
 * What is wrong with these versions of Solid, or nothing. Solid 2 moved its renderer
 * (`solid-js/universal`) and changed its compiler: with it, an application fails at its first import
 * with "Cannot find module", which does not say why.
 */
export function solidVersionProblem(versions: SolidVersions): string | undefined {
	const wrong: string[] = [];
	for (const [name, found] of [["solid-js", versions.solid], ["babel-preset-solid", versions.preset]] as const) {
		if (found !== undefined && Number.parseInt(versionOf(found), 10) !== SOLID_MAJOR) {
			// (with the folder it is in, when known: in a workspace, the project to change is the one that installs it)
			wrong.push(`${name} ${versionOf(found)}${typeof found === "string" ? "" : ` (${found.folder})`}`);
		}
	}
	if (wrong.length === 0) {
		return undefined;
	}
	const found = wrong.join(" and ");
	return (
		`raven-tsx: @decky.fx/raven-tsx/solid supports Solid ${SOLID_MAJOR}, not ${found}. ` +
		`Install Solid ${SOLID_MAJOR} in the project that installs it: npm install solid-js@${SOLID_MAJOR} && npm install -D babel-preset-solid@${SOLID_MAJOR} @babel/core@7 ` +
		`(bun add solid-js@${SOLID_MAJOR} && bun add -d babel-preset-solid@${SOLID_MAJOR} @babel/core@7). Solid 2 comes in a later version of raven-tsx.`
	);
}

/** Where a package's entry point is: from this package by default, the copy its renderer and loaders import. */
const fromHere = (name: string): string => fileURLToPath(import.meta.resolve(name));

/**
 * A package as it is installed where `resolveEntry` resolves its entry point (from this package by
 * default), or nothing when it is not installed there.
 */
export function installedPackage(name: string, resolveEntry: (name: string) => string = fromHere): InstalledPackage | undefined {
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
				return { version: manifest.version, folder };
			}
		} catch {
			// (no package.json in this folder: the one above)
		}
	}
	return undefined;
}

/** The version of a package where `resolveEntry` finds it, as `installedPackage` does. */
export function installedVersion(name: string, resolveEntry?: (name: string) => string): string | undefined {
	return installedPackage(name, resolveEntry)?.version;
}

/** What compiled TSX imports: the renderer of this package (see `solidBabelOptions`). */
export const RENDERER = "@decky.fx/raven-tsx/solid/renderer";

/**
 * The folder an application's packages are resolved from: that of its entry file when the runtime
 * gives one that exists (`Bun.main`, `process.argv[1]`), else the working directory. Run from the
 * root of a workspace, the entry's folder may see another solid-js than the root.
 */
export function applicationFolder(entry: string | undefined, cwd: string): string {
	return entry && isAbsolute(entry) && existsSync(entry) ? dirname(entry) : cwd;
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

/** Whether a file is TypeScript, whose types the runtime takes away after Babel. */
export const isTypeScript = (path: string): boolean => /\.tsx$/.test(path);

/** The options of Babel for a file, with the preset of Solid as the runtime loaded it. */
export function solidBabelOptions(path: string, solid: PluginItem): TransformOptions {
	return {
		filename: path,
		babelrc: false,
		configFile: false,
		// (an error says the line of the source: the runtimes do not read Babel's source maps)
		retainLines: true,
		parserOpts: { plugins: isTypeScript(path) ? ["jsx", "typescript"] : ["jsx"] },
		presets: [[solid, { generate: "universal", moduleName: RENDERER }]],
	};
}
