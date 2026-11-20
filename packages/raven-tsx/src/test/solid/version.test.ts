/** The Solid that an application has: the package is written for Solid 2, and says so of a Solid 1 (or of another major). */

import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applicationFolder, assertSolidVersion, installedPackage, installedVersion, nodeOptionsWords, preservesSymlinksMain, SOLID_MAJOR, solidVersionProblem } from "../../solid/compile";
import manifest from "../../../package.json";

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


test("Solid 2 is what the package is written for", () => {
	expect(SOLID_MAJOR).toBe(2);
	expect(solidVersionProblem({ solid: "2.0.3", universal: "2.0.3", compiler: "2.0.2" })).toBeUndefined();
	expect(solidVersionProblem({ solid: "2.0.0", universal: "2.1.0-beta.0", compiler: "2.0.0" })).toBeUndefined();
});

test("a package that is not installed is not a problem of version", () => {
	// (its own import fails then, with a message that already says which)
	expect(solidVersionProblem({})).toBeUndefined();
	expect(solidVersionProblem({ solid: "2.0.3" })).toBeUndefined();
	expect(solidVersionProblem({ universal: "2.0.3" })).toBeUndefined();
});

test("a Solid 1 is named, with what to install instead, and the version of this package written for it", () => {
	const problem = solidVersionProblem({ solid: "1.9.19", universal: "2.0.3", compiler: "2.0.2" });
	expect(problem).toContain("supports Solid 2, not solid-js 1.9.19.");
	expect(problem).not.toContain("@solidjs/universal 2.0.3");
	expect(problem).not.toContain("@solidjs/compiler 2.0.2");
	expect(problem).toContain("or update the dependency that brings that copy: npm install solid-js@2 (bun add solid-js@2).");
	// (only the command for what is wrong: the compiler may be in another project)
	expect(problem).not.toContain("@solidjs/universal@");
	expect(problem).not.toContain("@solidjs/compiler@");
	// (an application staying on Solid 1 has a version of this package for it)
	expect(problem).toEndWith(" For Solid 1, use raven-tsx 0.3.x: npm install @decky.fx/raven-tsx@0.3 (bun add @decky.fx/raven-tsx@0.3).");
});

test("the renderer's factory and the compiler of another major are named too, alone or with Solid 1, each with its command", () => {
	const universal = solidVersionProblem({ solid: "2.0.3", universal: "3.0.0-next.0" });
	expect(universal).toContain("not @solidjs/universal 3.0.0-next.0.");
	expect(universal).toContain("or update the dependency that brings that copy: npm install @solidjs/universal@2 (bun add @solidjs/universal@2).");
	expect(universal).not.toContain("solid-js@2");
	// (no Solid 1 found: no word of the version of this package for it)
	expect(universal).not.toContain("raven-tsx@0.3");
	const compiler = solidVersionProblem({ compiler: "3.0.0" });
	// (the compiler within its minor: what it compiles to must be what the renderer exports)
	expect(compiler).toContain("not @solidjs/compiler 3.0.0. Install Solid 2");
	expect(compiler).toContain("or update the dependency that brings that copy: npm install -D @solidjs/compiler@~2.0.2 (bun add -d @solidjs/compiler@~2.0.2).");
	expect(compiler).not.toContain("raven-tsx@0.3");
	const all = solidVersionProblem({ solid: "1.9.19", universal: "1.0.0", compiler: "0.1.0" });
	expect(all).toContain("not solid-js 1.9.19 and @solidjs/universal 1.0.0 and @solidjs/compiler 0.1.0.");
	expect(all).toContain(
		"or update the dependency that brings that copy: npm install solid-js@2 (bun add solid-js@2); npm install @solidjs/universal@2 (bun add @solidjs/universal@2); npm install -D @solidjs/compiler@~2.0.2 (bun add -d @solidjs/compiler@~2.0.2). For Solid 1, use raven-tsx 0.3.x",
	);
	// (a Solid after 2 is not one this package's earlier versions are written for)
	expect(solidVersionProblem({ solid: "3.0.0" })).not.toContain("raven-tsx@0.3");
});

test("the installed versions are those this package finds", () => {
	expect(installedVersion("solid-js")).toBe(manifest.devDependencies["solid-js"]);
	expect(installedVersion("@solidjs/universal")).toBe(manifest.devDependencies["@solidjs/universal"]);
	expect(installedVersion("@solidjs/compiler")).toBe(manifest.devDependencies["@solidjs/compiler"]);
	expect(installedVersion("no-such-package-of-raven-tsx")).toBeUndefined();
});

test("a version is found where it is asked to be resolved, as the plugin does from a source's folder", () => {
	const from = (folder: string) => (name: string) => Bun.resolveSync(name, folder);
	expect(installedVersion("solid-js", from(import.meta.dir))).toBe(manifest.devDependencies["solid-js"]);
	expect(installedVersion("@solidjs/universal", from(import.meta.dir))).toBe(manifest.devDependencies["@solidjs/universal"]);
	// (a package its resolver does not find is not installed there)
	expect(installedVersion("solid-js", () => {
		throw new Error("not found");
	})).toBeUndefined();
});

test("the check throws the problem, and passes the Solid 2 installed here", () => {
	expect(() => assertSolidVersion({ solid: installedVersion("solid-js"), universal: installedVersion("@solidjs/universal"), compiler: installedVersion("@solidjs/compiler") })).not.toThrow();
	expect(() => assertSolidVersion({ solid: "1.9.19" })).toThrow("supports Solid 2, not solid-js 1.9.19.");
	expect(() => assertSolidVersion({ compiler: "3.0.0" })).toThrow("supports Solid 2, not @solidjs/compiler 3.0.0.");
});

test("the application's folder is that of its entry when the runtime gives one that exists", () => {
	expect(applicationFolder(import.meta.path, "/somewhere")).toBe(import.meta.dir);
	// (none, a relative path, or a file that is not there: the working directory)
	expect(applicationFolder(undefined, "/somewhere")).toBe("/somewhere");
	expect(applicationFolder("src/index.ts", "/somewhere")).toBe("/somewhere");
	expect(applicationFolder(`${import.meta.dir}/no-such-entry.ts`, "/somewhere")).toBe("/somewhere");
	// (a folder, as `node apps/web` gives: that of the main file it runs, else the folder itself)
	// (its real path: on macOS the temporary folder is under /var, a link to /private/var)
	const app = realpathSync.native(mkdtempSync(join(tmpdir(), "raven-tsx-entry-")));
	try {
		writeFileSync(join(app, "package.json"), JSON.stringify({ name: "app", main: "dist/index.cjs" }));
		mkdirSync(join(app, "dist"));
		writeFileSync(join(app, "dist", "index.cjs"), "");
		expect(applicationFolder(app, "/somewhere")).toBe(join(app, "dist"));
		expect(applicationFolder(import.meta.dir, "/somewhere")).toBe(import.meta.dir);
		// (main resolved against the folder before .js is added: `dist/` is `dist`, so `dist.js` before `dist/index.js`)
		writeFileSync(join(app, "package.json"), JSON.stringify({ name: "app", main: "dist/" }));
		writeFileSync(join(app, "dist", "index.js"), "");
		mkdirSync(join(app, "lib"));
		writeFileSync(join(app, "lib", "dist.js"), "");
		writeFileSync(join(app, "lib", "package.json"), JSON.stringify({ name: "lib", main: "dist/" }));
		mkdirSync(join(app, "lib", "dist"));
		writeFileSync(join(app, "lib", "dist", "index.js"), "");
		expect(applicationFolder(join(app, "lib"), "/somewhere")).toBe(join(app, "lib"));
		expect(applicationFolder(app, "/somewhere")).toBe(join(app, "dist"));
		// (an absolute main is itself, not under the folder)
		writeFileSync(join(app, "package.json"), JSON.stringify({ name: "app", main: join(app, "lib", "dist.js") }));
		expect(applicationFolder(app, "/somewhere")).toBe(join(app, "lib"));
	} finally {
		rmSync(app, { recursive: true, force: true });
	}
});

test.skipIf(!canLink())("an entry that is a link counts where it leads, unless the runtime keeps the link", () => {
	const root = realpathSync.native(mkdtempSync(join(tmpdir(), "raven-tsx-entry-")));
	try {
		// (start.mjs at the root leads to apps/web/index.mjs, which runs from there)
		mkdirSync(join(root, "apps", "web"), { recursive: true });
		writeFileSync(join(root, "apps", "web", "index.mjs"), "");
		symlinkSync(join(root, "apps", "web", "index.mjs"), join(root, "start.mjs"));
		expect(applicationFolder(join(root, "start.mjs"), "/somewhere")).toBe(join(root, "apps", "web"));
		expect(applicationFolder(join(root, "start.mjs"), "/somewhere", true)).toBe(root);
		// (a link to a folder whose main file is deeper: through the link when it is kept)
		mkdirSync(join(root, "real", "dist"), { recursive: true });
		writeFileSync(join(root, "real", "package.json"), JSON.stringify({ name: "real", main: "dist/index.cjs" }));
		writeFileSync(join(root, "real", "dist", "index.cjs"), "");
		symlinkSync(join(root, "real"), join(root, "app-link"), "dir");
		expect(applicationFolder(join(root, "app-link"), "/somewhere")).toBe(join(root, "real", "dist"));
		expect(applicationFolder(join(root, "app-link"), "/somewhere", true)).toBe(join(root, "app-link", "dist"));
		// (a main file that is itself a link, kept: its folder in the application, not where it leads)
		mkdirSync(join(root, "shared"));
		writeFileSync(join(root, "shared", "start.cjs"), "");
		mkdirSync(join(root, "app2", "dist"), { recursive: true });
		writeFileSync(join(root, "app2", "package.json"), JSON.stringify({ name: "app2", main: "dist/start.cjs" }));
		symlinkSync(join(root, "shared", "start.cjs"), join(root, "app2", "dist", "start.cjs"));
		expect(applicationFolder(join(root, "app2"), "/somewhere", true)).toBe(join(root, "app2", "dist"));
		expect(applicationFolder(join(root, "app2"), "/somewhere")).toBe(join(root, "shared"));
		// (main naming a folder: its index, not a file of the same name with .cjs, which Node.js does not try)
		mkdirSync(join(root, "app3", "dist"), { recursive: true });
		writeFileSync(join(root, "app3", "package.json"), JSON.stringify({ name: "app3", main: "dist" }));
		writeFileSync(join(root, "app3", "dist", "index.js"), "");
		writeFileSync(join(root, "app3", "dist.cjs"), "");
		expect(applicationFolder(join(root, "app3"), "/somewhere", true)).toBe(join(root, "app3", "dist"));
		expect(applicationFolder(join(root, "app3"), "/somewhere")).toBe(join(root, "app3", "dist"));
		// (an index that is a link, as the fallback: kept when links are, else where it leads)
		mkdirSync(join(root, "app4"));
		writeFileSync(join(root, "app4", "package.json"), JSON.stringify({ name: "app4", main: "missing" }));
		symlinkSync(join(root, "shared", "start.cjs"), join(root, "app4", "index.js"));
		expect(applicationFolder(join(root, "app4"), "/somewhere", true)).toBe(join(root, "app4"));
		expect(applicationFolder(join(root, "app4"), "/somewhere")).toBe(join(root, "shared"));
		// (an entry that cannot be looked at, a loop of links: the working directory)
		symlinkSync(join(root, "loop"), join(root, "loop"));
		expect(applicationFolder(join(root, "loop"), "/somewhere")).toBe("/somewhere");
		// (a main under a loop of links: not a file, and the folder's index.js comes next)
		mkdirSync(join(root, "app5"));
		writeFileSync(join(root, "app5", "package.json"), JSON.stringify({ name: "app5", main: "loop/start.js" }));
		symlinkSync(join(root, "app5", "loop"), join(root, "app5", "loop"));
		writeFileSync(join(root, "app5", "index.js"), "");
		expect(applicationFolder(join(root, "app5"), "/somewhere")).toBe(join(root, "app5"));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("an installed package is named by the folder it is resolved from, and where it is installed", () => {
	// (with pnpm, the installed folder is in a store that several projects share: the project to change
	// is the one it is resolved from)
	const problem = solidVersionProblem({
		solid: { version: "1.9.19", folder: "/work/node_modules/.pnpm/solid-js@1.9.19/node_modules/solid-js", from: "/work/apps/web/src" },
		universal: { version: "2.0.3", folder: "/work/node_modules/@solidjs/universal", from: "/work" },
	});
	expect(problem).toContain("not solid-js 1.9.19 (resolved from /work/apps/web/src, installed in /work/node_modules/.pnpm/solid-js@1.9.19/node_modules/solid-js).");
	expect(problem).not.toContain("@solidjs/universal 2.0.3");
	expect(problem).toContain("Install Solid 2 in the project of the folder it is resolved from, or update the dependency that brings that copy:");
	const here = installedPackage("solid-js");
	expect(here?.folder).toMatch(/[\\/]node_modules[\\/]solid-js$/);
	expect(here?.from).toMatch(/[\\/]src[\\/]solid$/);
	expect(installedPackage("@solidjs/universal")?.folder).toMatch(/[\\/]node_modules[\\/]@solidjs[\\/]universal$/);
	expect(installedPackage("solid-js", (name) => Bun.resolveSync(name, import.meta.dir), import.meta.dir)?.from).toBe(import.meta.dir);
});

test("Node.js keeps the link of its main file when told so on its command line or in NODE_OPTIONS", () => {
	expect(preservesSymlinksMain([], undefined)).toBe(false);
	expect(preservesSymlinksMain(["--preserve-symlinks-main"], undefined)).toBe(true);
	expect(preservesSymlinksMain([], "--max-old-space-size=4096 --preserve-symlinks-main")).toBe(true);
	// (another flag that starts the same is not it)
	expect(preservesSymlinksMain(["--preserve-symlinks"], "--preserve-symlinks")).toBe(false);
	// (nor the flag's words inside a quoted value: one word, a file name)
	expect(preservesSymlinksMain([], '--require "./setup --preserve-symlinks-main fixture.cjs"')).toBe(false);
	expect(preservesSymlinksMain([], '--require "./a b.cjs" --preserve-symlinks-main')).toBe(true);
});

test("NODE_OPTIONS is split into words as Node.js splits it", () => {
	expect(nodeOptionsWords("")).toEqual([]);
	expect(nodeOptionsWords("  --a   --b=1 ")).toEqual(["--a", "--b=1"]);
	expect(nodeOptionsWords('--require "./with space.cjs" --c')).toEqual(["--require", "./with space.cjs", "--c"]);
	expect(nodeOptionsWords('--title "say \\"hi\\""')).toEqual(["--title", 'say "hi"']);
	// (quotes only open and close: an empty pair makes no word, and a quoted part joins its neighbours)
	expect(nodeOptionsWords('--empty ""')).toEqual(["--empty"]);
	expect(nodeOptionsWords('--a="b c"d')).toEqual(["--a=b cd"]);
	// (only a space separates: a tab is part of the word)
	expect(nodeOptionsWords("--title=demo\t--preserve-symlinks-main")).toEqual(["--title=demo\t--preserve-symlinks-main"]);
	expect(preservesSymlinksMain([], "--title=demo\t--preserve-symlinks-main")).toBe(false);
});
