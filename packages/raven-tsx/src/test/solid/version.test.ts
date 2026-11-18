/** The Solid that an application has: the package is written for Solid 1, and says so of a Solid 2. */

import { expect, test } from "bun:test";
import { dirname } from "node:path";
import { applicationFolder, assertSolidVersion, installedVersion, RENDERER, SOLID_MAJOR, solidVersionProblem } from "../../solid/compile";
import manifest from "../../../package.json";

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
	expect(problem).toContain("npm install solid-js@1 && npm install -D babel-preset-solid@1");
	expect(problem).toContain("bun add solid-js@1 && bun add -d babel-preset-solid@1");
	// (Babel 7 too: npm's latest is Babel 8, which babel-preset-solid 1 does not take)
	expect(problem).toContain("npm install -D babel-preset-solid@1 @babel/core@7");
	expect(problem).toContain("bun add -d babel-preset-solid@1 @babel/core@7");
});

test("the compiler of Solid 2 is named too, alone or with Solid 2", () => {
	expect(solidVersionProblem({ solid: "1.9.19", preset: "2.0.0-rc.2" })).toContain("not babel-preset-solid 2.0.0-rc.2.");
	expect(solidVersionProblem({ solid: "2.0.1", preset: "2.0.0-rc.2" })).toContain("not solid-js 2.0.1 and babel-preset-solid 2.0.0-rc.2.");
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
});

test("the renderer's solid-js is found from a source's folder, as the plugin checks it", () => {
	const rendererSolid = (folder: string) => installedVersion("solid-js", (name) => Bun.resolveSync(name, dirname(Bun.resolveSync(RENDERER, folder))));
	expect(rendererSolid(import.meta.dir)).toBe(manifest.devDependencies["solid-js"]);
	// (a folder where the renderer cannot be found: nothing to check)
	expect(installedVersion("solid-js", () => Bun.resolveSync("@decky.fx/no-such-renderer", import.meta.dir))).toBeUndefined();
});
