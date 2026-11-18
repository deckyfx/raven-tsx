/**
 * The plugin in a build checks the Solid of what it compiles: beside each source, and beside the
 * renderer that source's compiled TSX imports, unless the build leaves the renderer out.
 */

import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RENDERER } from "../../solid/compile";
import { solidPlugin } from "../../solid/plugin";

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) {
		rmSync(root, { recursive: true, force: true });
	}
});

/** Writes a file, with the folders it needs. */
function write(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}

/** A package of solid-js of this version, with an entry point that does nothing. */
function solidPackage(folder: string, version: string): void {
	write(join(folder, "package.json"), JSON.stringify({ name: "solid-js", version, type: "module", main: "index.js" }));
	write(join(folder, "index.js"), "export {};\n");
}

/**
 * A project whose source sees one solid-js, and whose copy of this package (the renderer the
 * compiled TSX imports) sees its own.
 */
function project(sourceSolid: string, rendererSolid: string): string {
	const root = mkdtempSync(join(tmpdir(), "raven-tsx-plugin-"));
	roots.push(root);
	write(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true, type: "module" }));
	solidPackage(join(root, "node_modules", "solid-js"), sourceSolid);
	const raven = join(root, "node_modules", "@decky.fx", "raven-tsx");
	write(join(raven, "package.json"), JSON.stringify({ name: "@decky.fx/raven-tsx", version: "0.0.0", type: "module", exports: { "./solid/renderer": "./solid/renderer.js" } }));
	const names = ["createElement", "createTextNode", "insertNode", "insert", "spread", "setProp", "effect", "memo", "createComponent", "mergeProps", "use"];
	write(join(raven, "solid", "renderer.js"), names.map((name) => `export const ${name} = () => undefined;`).join("\n"));
	solidPackage(join(raven, "node_modules", "solid-js"), rendererSolid);
	write(join(root, "src", "app.tsx"), "export const app = () => <label />;\n");
	return root;
}

/** Builds the project's source with the plugin, and gives what failed, or "" when it built. */
async function build(root: string, options: { readonly external?: string[]; readonly packages?: "bundle" | "external" } = {}): Promise<string> {
	try {
		const result = await Bun.build({ entrypoints: [join(root, "src", "app.tsx")], plugins: [solidPlugin()], ...options });
		return result.success ? "" : result.logs.map((log) => log.message).join("\n");
	} catch (error) {
		const errors = error instanceof AggregateError ? error.errors : [error];
		return errors.map((each: unknown) => (each instanceof Object && "message" in each ? String(each.message) : String(each))).join("\n");
	}
}

test("Solid 1 beside the source and beside the renderer builds", async () => {
	expect(await build(project("1.9.19", "1.9.19"))).toBe("");
});

test("a Solid 2 beside the source is refused, named with the folder it is resolved from", async () => {
	const root = project("2.0.1", "1.9.19");
	const failed = await build(root);
	expect(failed).toContain("supports Solid 1, not solid-js 2.0.1");
	expect(failed).toContain(`resolved from ${join(root, "src")}`);
});

test("a Solid 2 beside the renderer is refused, though the source has Solid 1, resolved from the renderer", async () => {
	const root = project("1.9.19", "2.0.1");
	const failed = await build(root);
	expect(failed).toContain("supports Solid 1, not solid-js 2.0.1");
	// (the project to change is the one of the renderer's copy, not the source's)
	expect(failed).toContain(`resolved from ${join(root, "node_modules", "@decky.fx", "raven-tsx", "solid")}`);
	expect(failed).toContain(join("node_modules", "@decky.fx", "raven-tsx", "node_modules", "solid-js"));
});

test("a renderer the build leaves out is not checked, however it does: where the build runs resolves it", async () => {
	expect(await build(project("1.9.19", "2.0.1"), { external: [RENDERER] })).toBe("");
	expect(await build(project("1.9.19", "2.0.1"), { external: ["@decky.fx/*"] })).toBe("");
	expect(await build(project("1.9.19", "2.0.1"), { external: ["@decky.fx/raven-tsx"] })).toBe("");
	expect(await build(project("1.9.19", "2.0.1"), { packages: "external" })).toBe("");
	// (the source's own Solid is still checked)
	expect(await build(project("2.0.1", "1.9.19"), { external: [RENDERER] })).toContain("not solid-js 2.0.1");
});

test("a renderer installed through a link to a folder of another name is checked too", async () => {
	const root = project("1.9.19", "2.0.1");
	// (node_modules/@decky.fx/raven-tsx links to vendor/local-raven: Bun loads the real path)
	const raven = join(root, "node_modules", "@decky.fx", "raven-tsx");
	const vendor = join(root, "vendor", "local-raven");
	mkdirSync(dirname(vendor), { recursive: true });
	renameSync(raven, vendor);
	symlinkSync(vendor, raven, "dir");
	const failed = await build(root);
	expect(failed).toContain("supports Solid 1, not solid-js 2.0.1");
	expect(failed).toContain(`resolved from ${join(vendor, "solid")}`);
});

test("a file of another package named solid/renderer is not checked", async () => {
	const root = project("1.9.19", "1.9.19");
	// (the application's own renderer.js, in a folder that sees a Solid 2: not this package's renderer)
	const other = join(root, "lib", "raven-tsx", "src", "solid");
	write(join(root, "lib", "raven-tsx", "package.json"), JSON.stringify({ name: "my-own-renderer", version: "1.0.0", type: "module" }));
	write(join(other, "renderer.js"), "export const mine = 1;\n");
	solidPackage(join(root, "lib", "raven-tsx", "node_modules", "solid-js"), "2.0.1");
	write(join(root, "src", "app.tsx"), `import { mine } from "../lib/raven-tsx/src/solid/renderer.js";\nexport const app = () => <label>{mine}</label>;\n`);
	expect(await build(root)).toBe("");
});
