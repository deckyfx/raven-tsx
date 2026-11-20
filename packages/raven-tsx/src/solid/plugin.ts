/**
 * The Bun plugin that runs an application of `@decky.fx/raven-tsx/solid`. Bun compiles JSX as
 * React does; Solid compiles it to calls of its renderer, with its own compiler (`@solidjs/compiler`,
 * in its universal mode, for the renderer of `@decky.fx/raven-tsx/solid/renderer`), each line of
 * the result on the line of the source (see `./lines`). And on Bun, `solid-js` resolves to its build
 * for servers, which does not react: the plugin loads the one for clients.
 *
 * To run: `preload = ["@decky.fx/raven-tsx/solid/preload"]` in bunfig.toml. To build:
 *
 *     await Bun.build({ entrypoints: ["src/index.tsx"], plugins: [solidPlugin()], compile: true });
 */

import type { BunPlugin } from "bun";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSolidVersion, installedPackage, isRendererFile, isTypeScript, solidCompiler, SOURCES, type SolidCompile, type SolidOutput } from "./compile";
import { retainLines } from "./lines";

/** What the plugin can be told. */
export interface SolidPluginOptions {
	/** The files it compiles for Solid. All `.tsx` and `.jsx` files outside node_modules by default. */
	readonly filter?: RegExp | undefined;
	/** Takes the development builds of Solid, which warn of mistakes. */
	readonly development?: boolean | undefined;
}

/** What `exports` of a package.json gives for a subpath, or a choice of conditions. */
type ExportsEntry = string | null | { readonly [condition: string]: ExportsEntry };

/** The entry of the first condition that is one of these, as Node picks one. */
function pick(entry: ExportsEntry | undefined, conditions: readonly string[]): string | undefined {
	if (typeof entry === "string") {
		return entry;
	}
	for (const [condition, value] of Object.entries(entry ?? {})) {
		const found = conditions.includes(condition) ? pick(value, conditions) : undefined;
		if (found) {
			return found;
		}
	}
	return undefined;
}

/** The files of Solid that Bun would load, by package folder and build, each with the file for clients that replaces it. */
const clientFiles = new Map<string, ReadonlyMap<string, string>>();

/**
 * What replaces each file of a package of Solid that Bun takes (`node`: the build of solid-js for
 * servers): the one a client would take for the same import, as Node picks them from `exports`.
 * With `development`, the development builds: those of solid-js need those of @solidjs/signals.
 */
function clientFilesOf(root: string, development: boolean): ReadonlyMap<string, string> {
	const key = `${root}\0${development}`;
	let files = clientFiles.get(key);
	if (!files) {
		const { exports } = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as { readonly exports: Readonly<Record<string, ExportsEntry>> };
		const map = new Map<string, string>();
		for (const entry of Object.values(exports)) {
			for (const style of ["import", "require"]) {
				// (the builds Bun takes by the conditions it is given: the development ones itself unless it
				// started with NODE_ENV=production, the observed ones with `--conditions=observe`. Each is replaced
				// by the client's of the same kind; the plain one by the development one when asked)
				for (const kind of [[], ["development"], ["observe"]]) {
					const server = pick(entry, ["node", ...kind, style, "default"]);
					const client = pick(entry, ["browser", ...(kind.length > 0 ? kind : development ? ["development"] : []), style, "default"]);
					if (server && client && server !== client) {
						map.set(resolve(root, server), resolve(root, client));
					}
				}
			}
		}
		files = map;
		clientFiles.set(key, files);
	}
	return files;
}

/**
 * The packages of Solid whose builds the plugin may replace: solid-js (its build for servers), and
 * for the development builds the packages it imports, which have no build for servers.
 */
const SOLID_FOLDERS = ["solid-js", join("@solidjs", "signals"), join("@solidjs", "universal")];

/** The files of solid-js for servers, which the plugin replaces: `server.js`, `server.dev.js`... */
const SERVER_FILES = /[\\/]solid-js[\\/].*server(?:\.\w+)?\.c?js$/;

/** The files of the packages of Solid, of which the development builds replace some. */
const SOLID_FILES = /[\\/](?:solid-js|@solidjs[\\/](?:signals|universal))[\\/].*\.c?js$/;

/** The folder of the package of Solid a file is in: the deepest, for one inside another's node_modules. */
function solidRoot(path: string): string {
	let root = "";
	for (const name of SOLID_FOLDERS) {
		const at = path.lastIndexOf(`${sep}${name}${sep}`);
		if (at >= 0 && at + name.length + 1 > root.length) {
			root = path.slice(0, at + name.length + 1);
		}
	}
	return root;
}

/**
 * The compiled code with its lines on those of the source: Bun reads no source map of a plugin, and
 * an error says the line it runs. Only when Bun reads it as the same program (a line break moved in
 * a text would change it): else as it was compiled.
 */
function onSourceLines({ code, map }: SolidOutput, loader: "ts" | "js"): string {
	if (!map) {
		return code;
	}
	try {
		const retained = retainLines(code, map);
		// (whitespace aside: Bun keeps the line breaks of what it is given, as in an object over several lines)
		const transpiler = new Bun.Transpiler({ loader, minifyWhitespace: true });
		return transpiler.transformSync(retained) === transpiler.transformSync(code) ? retained : code;
	} catch {
		// (code Bun cannot read: as it was compiled, for Bun to say what is wrong in it)
		return code;
	}
}

/** Files that may be the renderer of this package; `isRendererFile` tells which is. */
const RENDERER_FILE = /[\\/]renderer\.[cm]?[jt]s$/;

/** The real path of this package's renderer beside the plugin, or nothing when it is not there. */
function rendererPath(): string | undefined {
	try {
		return realpathSync(fileURLToPath(new URL("./renderer.ts", import.meta.url)));
	} catch {
		return undefined;
	}
}

/** The plugin: compiles TSX for Solid, and takes Solid's build for clients. */
export function solidPlugin(options: SolidPluginOptions = {}): BunPlugin {
	const development = options.development ?? false;
	// (the compiler is the one the plugin loads, from where it is installed)
	assertSolidVersion({ compiler: installedPackage("@solidjs/compiler") });
	let compiler: Promise<SolidCompile> | null = null;
	return {
		name: "raven-tsx-solid",
		setup(build) {
			// (the Solid of what is compiled, from the folder of each source: that of the application,
			// which a build may hold in another installation than the plugin's; looked up again by each
			// build, as Solid may have changed between two)
			const checkedFolders = new Set<string>();
			const assertSolidFrom = (folder: string): void => {
				if (!checkedFolders.has(folder)) {
					const from = (name: string): string => Bun.resolveSync(name, folder);
					assertSolidVersion({ solid: installedPackage("solid-js", from, folder), universal: installedPackage("@solidjs/universal", from, folder) });
					checkedFolders.add(folder);
				}
			};
			// (the renderer of this package, when it is loaded: its own solid-js, which may be another copy
			// than the sources'. A renderer the build leaves out, however it does, is never loaded here, and
			// the place it runs in resolves it)
			if (build.config) {
				// (a build: any file named renderer, checked when it is this package's, then left to Bun and
				// the other plugins, with the loader they give it)
				build.onLoad({ filter: RENDERER_FILE }, ({ path }) => {
					if (isRendererFile(path)) {
						assertSolidFrom(dirname(path));
					}
					return undefined;
				});
			} else {
				// (at run time a hook must give the contents: only this package's own renderer is taken. The
				// preload has checked its solid-js already; this checks it again when it is loaded)
				const renderer = rendererPath();
				if (renderer) {
					build.onLoad({ filter: new RegExp(`^${renderer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }, ({ path }) => {
						assertSolidFrom(dirname(path));
						return { contents: readFileSync(path, "utf8"), loader: "ts" };
					});
				}
			}
			// (Bun runs no onResolve of a plugin for a package: the file Bun takes forwards to the client's,
			// which keeps its own path, for the relative imports in it, and is one module with it)
			build.onLoad({ filter: development ? SOLID_FILES : SERVER_FILES }, ({ path }) => {
				const client = clientFilesOf(solidRoot(path), development).get(path);
				return { contents: client ? `export * from ${JSON.stringify(client)};\n` : readFileSync(path, "utf8"), loader: "js" };
			});
			build.onLoad({ filter: options.filter ?? SOURCES }, async ({ path }) => {
				// (before the source runs and imports Solid: a Solid 1 would fail there without saying why)
				assertSolidFrom(dirname(path));
				// (loaded here, so that an application of React never needs it)
				compiler ??= solidCompiler();
				// (the types stay, for Bun to take away: the compiler only compiles the JSX)
				const compile = await compiler;
				const loader = isTypeScript(path) ? "ts" : "js";
				return { contents: onSourceLines(compile(await Bun.file(path).text(), path), loader), loader };
			});
		},
	};
}
