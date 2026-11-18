/**
 * Runs an application of `@decky.fx/raven-tsx/solid` under Node.js, as the preload does on Bun:
 *
 *     node --import @decky.fx/raven-tsx/solid/register src/index.tsx
 *
 * Its hooks, in the thread of the application (`module.registerHooks`):
 *
 * - compile `.tsx` and `.jsx` outside node_modules for Solid, with Babel (see `./compile`), and give
 *   the result to Node.js as TypeScript, whose types it takes away itself: erasable TypeScript
 *   only, as Node.js runs it;
 * - resolve `solid-js` with the condition "browser": on Node.js it is otherwise its build for
 *   servers, which does not react.
 */

import { readFileSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applicationFolder, assertSolidVersion, installedPackage, isTypeScript, solidBabelOptions, SOURCES } from "./compile";

// (before the compiler is loaded and the application imports Solid: a Solid 2 would fail there
// without saying why, as would a Solid 2 with no compiler installed yet. Both the solid-js that the
// renderer of the package imports and the one of the application's entry, which may be another copy)
assertSolidVersion({ solid: installedPackage("solid-js"), preset: installedPackage("babel-preset-solid") });
const application = applicationFolder(process.argv[1], process.cwd());
assertSolidVersion({ solid: installedPackage("solid-js", (name) => createRequire(join(application, "index.js")).resolve(name), application) });

const [{ default: babel }, { default: solid }] = await Promise.all([import("@babel/core"), import("babel-preset-solid")]);

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
		const result = babel.transformSync(readFileSync(path, "utf8"), solidBabelOptions(path, solid));
		if (typeof result?.code !== "string") {
			throw new Error(`raven-tsx: Babel compiled nothing from ${path}`);
		}
		return { format: isTypeScript(path) ? "module-typescript" : "module", source: result.code, shortCircuit: true };
	},
});
