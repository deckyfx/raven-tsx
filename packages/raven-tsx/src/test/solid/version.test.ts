/** The Solid that an application has: the package is written for Solid 1, and says so of a Solid 2. */

import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applicationFolder, assertSolidVersion, installedPackage, installedVersion, preservesSymlinksMain, SOLID_MAJOR, solidVersionProblem } from "../../solid/compile";
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


test("Solid 1 is what the package is written for", () => {
	expect(SOLID_MAJOR).toBe(1);
	expect(solidVersionProblem({ solid: "1.9.19", preset: "1.9.19" })).toBeUndefined();
	expect(solidVersionProblem({ solid: "1.9.0", preset: "1.10.0-beta.0" })).toBeUndefined();
});

test("a package that is not installed is not a problem of version", () => {
	// (its own import fails then, with a message that already says which)
	expect(solidVersionProblem({})).toBeUndefined();
	expect(solidVersionProblem({ solid: "1.9.19" })).toBeUndefined();
});

test("a Solid 2 is named, with what to install instead", () => {
	const problem = solidVersionProblem({ solid: "2.0.1", preset: "1.9.19" });
	expect(problem).toContain("solid-js 2.0.1");
	expect(problem).not.toContain("babel-preset-solid 1.9.19");
	expect(problem).toContain("or update the dependency that brings that copy: npm install solid-js@1 (bun add solid-js@1).");
	// (only the command for what is wrong: the compiler may be in another project)
	expect(problem).not.toContain("babel-preset-solid@1");
});

test("the compiler of Solid 2 is named too, alone or with Solid 2, each with its command", () => {
	const preset = solidVersionProblem({ solid: "1.9.19", preset: "2.0.0-rc.2" });
	expect(preset).toContain("not babel-preset-solid 2.0.0-rc.2.");
	// (Babel 7 with it: npm's latest is Babel 8, which babel-preset-solid 1 does not take)
	expect(preset).toContain("or update the dependency that brings that copy: npm install -D babel-preset-solid@1 @babel/core@7 (bun add -d babel-preset-solid@1 @babel/core@7).");
	expect(preset).not.toContain("solid-js@1");
	const both = solidVersionProblem({ solid: "2.0.1", preset: "2.0.0-rc.2" });
	expect(both).toContain("not solid-js 2.0.1 and babel-preset-solid 2.0.0-rc.2.");
	expect(both).toContain("or update the dependency that brings that copy: npm install solid-js@1 (bun add solid-js@1); npm install -D babel-preset-solid@1 @babel/core@7");
});

test("the installed versions are those this package finds", () => {
	expect(installedVersion("solid-js")).toBe(manifest.devDependencies["solid-js"]);
	expect(installedVersion("babel-preset-solid")).toBe(manifest.devDependencies["babel-preset-solid"]);
	expect(installedVersion("no-such-package-of-raven-tsx")).toBeUndefined();
});

test("a version is found where it is asked to be resolved, as the plugin does from a source's folder", () => {
	const from = (folder: string) => (name: string) => Bun.resolveSync(name, folder);
	expect(installedVersion("solid-js", from(import.meta.dir))).toBe(manifest.devDependencies["solid-js"]);
	// (a package its resolver does not find is not installed there)
	expect(installedVersion("solid-js", () => {
		throw new Error("not found");
	})).toBeUndefined();
});

test("the check throws the problem, and passes Solid 1", () => {
	expect(() => assertSolidVersion({ solid: installedVersion("solid-js"), preset: installedVersion("babel-preset-solid") })).not.toThrow();
	expect(() => assertSolidVersion({ solid: "2.0.1" })).toThrow("supports Solid 1, not solid-js 2.0.1.");
});

test("the application's folder is that of its entry when the runtime gives one that exists", () => {
	expect(applicationFolder(import.meta.path, "/somewhere")).toBe(import.meta.dir);
	// (none, a relative path, or a file that is not there: the working directory)
	expect(applicationFolder(undefined, "/somewhere")).toBe("/somewhere");
	expect(applicationFolder("src/index.ts", "/somewhere")).toBe("/somewhere");
	expect(applicationFolder(`${import.meta.dir}/no-such-entry.ts`, "/somewhere")).toBe("/somewhere");
	// (a folder, as `node apps/web` gives: that of the main file it runs, else the folder itself)
	const app = mkdtempSync(join(tmpdir(), "raven-tsx-entry-"));
	try {
		writeFileSync(join(app, "package.json"), JSON.stringify({ name: "app", main: "dist/index.cjs" }));
		mkdirSync(join(app, "dist"));
		writeFileSync(join(app, "dist", "index.cjs"), "");
		expect(applicationFolder(app, "/somewhere")).toBe(join(app, "dist"));
		expect(applicationFolder(import.meta.dir, "/somewhere")).toBe(import.meta.dir);
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
		// (an entry that cannot be looked at, a loop of links: the working directory)
		symlinkSync(join(root, "loop"), join(root, "loop"));
		expect(applicationFolder(join(root, "loop"), "/somewhere")).toBe("/somewhere");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("an installed package is named by the folder it is resolved from, and where it is installed", () => {
	// (with pnpm, the installed folder is in a store that several projects share: the project to change
	// is the one it is resolved from)
	const problem = solidVersionProblem({
		solid: { version: "2.0.1", folder: "/work/node_modules/.pnpm/solid-js@2.0.1/node_modules/solid-js", from: "/work/apps/web/src" },
		preset: { version: "1.9.19", folder: "/work/node_modules/babel-preset-solid", from: "/work" },
	});
	expect(problem).toContain("not solid-js 2.0.1 (resolved from /work/apps/web/src, installed in /work/node_modules/.pnpm/solid-js@2.0.1/node_modules/solid-js).");
	expect(problem).not.toContain("babel-preset-solid 1.9.19");
	expect(problem).toContain("Install Solid 1 in the project of the folder it is resolved from, or update the dependency that brings that copy:");
	const here = installedPackage("solid-js");
	expect(here?.folder).toMatch(/[\\/]node_modules[\\/]solid-js$/);
	expect(here?.from).toMatch(/[\\/]src[\\/]solid$/);
	expect(installedPackage("solid-js", (name) => Bun.resolveSync(name, import.meta.dir), import.meta.dir)?.from).toBe(import.meta.dir);
});

test("Node.js keeps the link of its main file when told so on its command line or in NODE_OPTIONS", () => {
	expect(preservesSymlinksMain([], undefined)).toBe(false);
	expect(preservesSymlinksMain(["--preserve-symlinks-main"], undefined)).toBe(true);
	expect(preservesSymlinksMain([], "--max-old-space-size=4096 --preserve-symlinks-main")).toBe(true);
	// (another flag that starts the same is not it)
	expect(preservesSymlinksMain(["--preserve-symlinks"], "--preserve-symlinks")).toBe(false);
});
