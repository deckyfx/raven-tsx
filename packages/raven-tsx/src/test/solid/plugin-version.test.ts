/**
 * The plugin in a build checks the Solid of what it compiles: beside each source, and beside the
 * renderer that source's compiled TSX imports, unless the build leaves the renderer out.
 */

import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RENDERER } from "../../solid/compile";
import { solidPlugin } from "../../solid/plugin";

const roots: string[] = [];

/** Whether this system lets a process make symbolic links (Windows asks for a privilege or developer mode). */
function canLink(): boolean {
	const folder = mkdtempSync(join(tmpdir(), "raven-tsx-link-"));
	try {
		symlinkSync(folder, join(folder, "link"), "dir");
		return true;
	} catch {
		return false;
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
}


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

/** A package of this name and version in a folder of node_modules, with an entry point that does nothing. */
function fakePackage(modules: string, name: string, version: string): void {
	const folder = join(modules, name);
	write(join(folder, "package.json"), JSON.stringify({ name, version, type: "module", main: "index.js" }));
	write(join(folder, "index.js"), "export {};\n");
}

/** The packages of Solid an application has, in a folder of node_modules: solid-js, and @solidjs/universal unless it is left out. */
function solidPackages(modules: string, solid: string, universal: string | null = "2.0.3"): void {
	fakePackage(modules, "solid-js", solid);
	if (universal !== null) {
		fakePackage(modules, "@solidjs/universal", universal);
	}
}

/** The versions of @solidjs/universal beside the source and beside the renderer: Solid 2's by default, `null` for none. */
interface Universals {
	readonly source?: string | null;
	readonly renderer?: string | null;
}

/**
 * A project whose source sees one solid-js (and @solidjs/universal), and whose copy of this package
 * (the renderer the compiled TSX imports) sees its own.
 */
function project(sourceSolid: string, rendererSolid: string, universal: Universals = {}): string {
	// (its real path: on Windows the temporary folder is given in its short form, RUNNER~1, and Bun reports the long one)
	const root = realpathSync.native(mkdtempSync(join(tmpdir(), "raven-tsx-plugin-")));
	roots.push(root);
	write(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true, type: "module" }));
	solidPackages(join(root, "node_modules"), sourceSolid, universal.source);
	const raven = join(root, "node_modules", "@decky.fx", "raven-tsx");
	write(join(raven, "package.json"), JSON.stringify({ name: "@decky.fx/raven-tsx", version: "0.0.0", type: "module", exports: { "./solid/renderer": "./solid/renderer.js" } }));
	const names = ["createElement", "createTextNode", "insertNode", "insert", "spread", "setProp", "effect", "memo", "createComponent", "mergeProps", "applyRef", "use"];
	write(join(raven, "solid", "renderer.js"), names.map((name) => `export const ${name} = () => undefined;`).join("\n"));
	solidPackages(join(raven, "node_modules"), rendererSolid, universal.renderer);
	write(join(root, "src", "app.tsx"), "export const app = () => <label />;\n");
	return root;
}

/** Builds the project's source with the plugin, and gives what failed, or "" when it built. */
async function build(root: string, options: Pick<Bun.BuildConfig, "external" | "packages" | "loader"> = {}): Promise<string> {
	try {
		const result = await Bun.build({ entrypoints: [join(root, "src", "app.tsx")], plugins: [solidPlugin()], ...options });
		return result.success ? "" : result.logs.map((log) => log.message).join("\n");
	} catch (error) {
		const errors = error instanceof AggregateError ? error.errors : [error];
		return errors.map((each: unknown) => (each instanceof Object && "message" in each ? String(each.message) : String(each))).join("\n");
	}
}

test("Solid 2 beside the source and beside the renderer builds", async () => {
	expect(await build(project("2.0.3", "2.0.3"))).toBe("");
	// (a package that is not there is not a problem of version: its own import says it is missing)
	expect(await build(project("2.0.3", "2.0.3", { source: null, renderer: null }))).toBe("");
});

test("a Solid 1 beside the source is refused, named with the folder it is resolved from, and the version of this package for it", async () => {
	const root = project("1.9.19", "2.0.3");
	const failed = await build(root);
	expect(failed).toContain("supports Solid 2, not solid-js 1.9.19");
	expect(failed).toContain(`resolved from ${join(root, "src")}`);
	expect(failed).toContain("For Solid 1, use raven-tsx 0.3.x");
});

test("a Solid 1 beside the renderer is refused, though the source has Solid 2, resolved from the renderer", async () => {
	const root = project("2.0.3", "1.9.19");
	const failed = await build(root);
	expect(failed).toContain("supports Solid 2, not solid-js 1.9.19");
	// (the project to change is the one of the renderer's copy, not the source's)
	expect(failed).toContain(`resolved from ${join(root, "node_modules", "@decky.fx", "raven-tsx", "solid")}`);
	expect(failed).toContain(join("node_modules", "@decky.fx", "raven-tsx", "node_modules", "solid-js"));
});

test("an @solidjs/universal of another major is refused, beside the source or beside the renderer", async () => {
	const source = project("2.0.3", "2.0.3", { source: "3.0.0" });
	const atSource = await build(source);
	expect(atSource).toContain("supports Solid 2, not @solidjs/universal 3.0.0");
	expect(atSource).toContain(`resolved from ${join(source, "src")}`);
	expect(atSource).toContain("npm install @solidjs/universal@2");
	const renderer = project("2.0.3", "2.0.3", { renderer: "3.0.0" });
	const atRenderer = await build(renderer);
	expect(atRenderer).toContain("not @solidjs/universal 3.0.0");
	expect(atRenderer).toContain(`resolved from ${join(renderer, "node_modules", "@decky.fx", "raven-tsx", "solid")}`);
});

test("a renderer the build leaves out is not checked, however it does: where the build runs resolves it", async () => {
	expect(await build(project("2.0.3", "1.9.19"), { external: [RENDERER] })).toBe("");
	expect(await build(project("2.0.3", "1.9.19"), { external: ["@decky.fx/*"] })).toBe("");
	expect(await build(project("2.0.3", "1.9.19"), { external: ["@decky.fx/raven-tsx"] })).toBe("");
	expect(await build(project("2.0.3", "1.9.19"), { packages: "external" })).toBe("");
	// (the source's own Solid is still checked)
	expect(await build(project("1.9.19", "2.0.3"), { external: [RENDERER] })).toContain("not solid-js 1.9.19");
});

test.skipIf(!canLink())("a renderer installed through a link to a folder of another name is checked too", async () => {
	const root = project("2.0.3", "1.9.19");
	// (node_modules/@decky.fx/raven-tsx links to vendor/local-raven: Bun loads the real path)
	const raven = join(root, "node_modules", "@decky.fx", "raven-tsx");
	const vendor = join(root, "vendor", "local-raven");
	mkdirSync(dirname(vendor), { recursive: true });
	renameSync(raven, vendor);
	symlinkSync(vendor, raven, "dir");
	const failed = await build(root);
	expect(failed).toContain("supports Solid 2, not solid-js 1.9.19");
	expect(failed).toContain(`resolved from ${join(vendor, "solid")}`);
});

test("a file of another package named solid/renderer is not checked", async () => {
	const root = project("2.0.3", "2.0.3");
	// (the application's own renderer.js, in a folder that sees a Solid 1: not this package's renderer)
	const other = join(root, "lib", "raven-tsx", "src", "solid");
	write(join(root, "lib", "raven-tsx", "package.json"), JSON.stringify({ name: "my-own-renderer", version: "1.0.0", type: "module" }));
	write(join(other, "renderer.js"), "export const mine = 1;\n");
	solidPackages(join(root, "lib", "raven-tsx", "node_modules"), "1.9.19", null);
	write(join(root, "src", "app.tsx"), `import { mine } from "../lib/raven-tsx/src/solid/renderer.js";\nexport const app = () => <label>{mine}</label>;\n`);
	expect(await build(root)).toBe("");
});

test("a file named renderer that is not this package's keeps the loader the build gives its extension", async () => {
	const root = project("2.0.3", "2.0.3");
	// (not JavaScript: read as text, as the build says of .cjs)
	write(join(root, "src", "renderer.cjs"), "plain words, not { JavaScript\n");
	write(join(root, "src", "app.tsx"), `import words from "./renderer.cjs";\nexport const app = () => <label>{words}</label>;\n`);
	expect(await build(root, { loader: { ".cjs": "text" } })).toBe("");
	// (and without that setting, it is JavaScript, which these words are not)
	expect(await build(root)).not.toBe("");
});

test("a file named renderer that is not this package's reaches the plugins after it", async () => {
	const root = project("2.0.3", "2.0.3");
	// (a template another plugin turns into JavaScript: this plugin must not answer for it)
	write(join(root, "src", "renderer.cjs"), "{{ a template, not JavaScript }}\n");
	write(join(root, "src", "app.tsx"), `import words from "./renderer.cjs";\nexport const app = () => <label>{words}</label>;\n`);
	const template = { name: "template", setup: (build: Bun.PluginBuilder) => void build.onLoad({ filter: /renderer\.cjs$/ }, () => ({ contents: `export default "from the template";`, loader: "js" })) };
	const result = await Bun.build({ entrypoints: [join(root, "src", "app.tsx")], plugins: [solidPlugin(), template] });
	expect(result.success).toBe(true);
	expect(await result.outputs[0]?.text()).toContain("from the template");
});
