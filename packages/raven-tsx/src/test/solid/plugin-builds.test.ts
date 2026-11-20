/** What a build with the plugin takes of Solid: the builds for clients, whatever conditions Bun is given. */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// (in the package, so that solid-js resolves as for an application)
let folder = "";
beforeAll(() => {
	folder = mkdtempSync(join(import.meta.dir, "..", "..", "..", ".plugin-build-"));
	writeFileSync(join(folder, "entry.ts"), 'import { createSignal } from "solid-js";\nexport const signal = createSignal(0);\n');
	// (a build in a process of its own: Bun takes the development builds by the NODE_ENV it started
	// with, and bun test starts with "test". A plugin before the package's sees each file of solid-js
	// loaded, which it leaves to the next)
	writeFileSync(
		join(folder, "build.ts"),
		[
			`import { solidPlugin } from ${JSON.stringify(join(import.meta.dir, "..", "..", "solid", "plugin.ts"))};`,
			"const { conditions, development } = JSON.parse(process.argv[2]!);",
			"const loaded: string[] = [];",
			"const spy = { name: 'spy', setup(build: Bun.PluginBuilder) { build.onLoad({ filter: /[\\\\/]solid-js[\\\\/]dist[\\\\/]/ }, ({ path }) => { loaded.push(path.split(/[\\\\/]/).pop()!); return undefined; }); } };",
			"const result = await Bun.build({ entrypoints: [import.meta.dir + '/entry.ts'], target: 'bun', conditions, plugins: [spy, solidPlugin({ development })] });",
			"if (!result.success) throw new AggregateError(result.logs, 'the build failed');",
			"console.log(JSON.stringify(loaded));",
		].join("\n"),
	);
});
afterAll(() => {
	rmSync(folder, { recursive: true, force: true });
});

/** The files of solid-js's dist that a build loaded, with Bun started with this NODE_ENV (none: unset). */
async function loadedBy(environment: string | undefined, conditions: string[], development = false): Promise<string[]> {
	const env: Record<string, string | undefined> = { ...process.env, NODE_ENV: environment };
	const child = Bun.spawn(["bun", join(folder, "build.ts"), JSON.stringify({ conditions, development })], { env, stdout: "pipe", stderr: "pipe" });
	const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	expect({ code, err }).toEqual({ code: 0, err: "" });
	return JSON.parse(out) as string[];
}

/** The builds for clients among them: one for servers that Bun takes forwards to one of these. */
const clients = (files: readonly string[]): string[] => files.filter((file) => file.startsWith("solid."));

test("a build for production gets solid-js's build for clients", async () => {
	expect(clients(await loadedBy("production", []))).toEqual(["solid.js"]);
});

test("a build not for production, where Bun takes the development builds, gets the development build for clients", async () => {
	expect(clients(await loadedBy(undefined, []))).toEqual(["solid.dev.js"]);
});

test("a build with the condition observe gets solid-js's observed build for clients", async () => {
	expect(clients(await loadedBy("production", ["observe"]))).toEqual(["solid.observe.js"]);
});

test("the plugin told development takes the development build for clients", async () => {
	expect(clients(await loadedBy("production", [], true))).toEqual(["solid.dev.js"]);
});
