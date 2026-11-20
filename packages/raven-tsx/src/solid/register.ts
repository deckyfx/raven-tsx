/**
 * Runs an application of `@decky.fx/raven-tsx/solid` under Node.js, as the preload does on Bun:
 *
 *     node --import @decky.fx/raven-tsx/solid/register src/index.tsx
 *
 * Its hooks, in the thread of the application (`module.registerHooks`):
 *
 * - compile `.tsx` and `.jsx` outside node_modules for Solid, with its compiler (see `./compile`),
 *   and give the result to Node.js as TypeScript, whose types it takes away itself: erasable
 *   TypeScript only, as Node.js runs it. The source map is inline: with `--enable-source-maps`, an
 *   error says the line of the source;
 * - resolve `solid-js` with the condition "browser": on Node.js it is otherwise its build for
 *   servers, which does not react. (`@solidjs/universal` and `@solidjs/signals` have one build.)
 */

import { readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationFolder, assertSolidVersion, installedPackage, isTypeScript, preservesSymlinksMain, solidCompiler, SOURCES, withInlineMap } from "./compile";

// (before the compiler is loaded and the application imports Solid: a Solid 1 would fail there
// without saying why, as would a compiler of Solid 1's time. Both the solid-js that the renderer of
// the package imports and the one of the application's entry, which may be another copy)
assertSolidVersion({ solid: installedPackage("solid-js"), universal: installedPackage("@solidjs/universal"), compiler: installedPackage("@solidjs/compiler") });
const application = applicationFolder(process.argv[1], process.cwd(), preservesSymlinksMain(process.execArgv, process.env["NODE_OPTIONS"]));
assertSolidVersion({ solid: installedPackage("solid-js", (name) => createRequire(join(application, "index.js")).resolve(name), application) });

const compile = await solidCompiler();

/** Whether a specifier is of solid-js, which must be its build for clients. */
const isSolid = (specifier: string): boolean => specifier === "solid-js" || specifier.startsWith("solid-js/");

registerHooks({
	resolve(specifier, context, nextResolve) {
		return nextResolve(specifier, isSolid(specifier) ? { ...context, conditions: ["browser", ...context.conditions] } : context);
	},
	load(url, context, nextLoad) {
		const path = url.startsWith("file:") ? fileURLToPath(url) : null;
		if (!path || !SOURCES.test(path)) {
			return nextLoad(url, context);
		}
		return { format: isTypeScript(path) ? "module-typescript" : "module", source: withInlineMap(compile(readFileSync(path, "utf8"), path)), shortCircuit: true };
	},
});
