/**
 * Installs the packages as npm would give them to an application, and compiles one with the strict
 * settings an application can choose: the sources are TypeScript, so they are compiled with its
 * settings, and skipLibCheck does not skip them. Then loads the library from the platform package.
 *
 *     bun run check:consumer --platform <folder of pack:platform for this machine>
 *
 * The main package is made here, by prepare:publish. There are two applications, one of React and
 * one of Solid: each is a Hello World example, with a file that passes `undefined` to optional props
 * (`exactOptionalPropertyTypes`). The one of Solid runs through the plugin of the package, as its
 * bunfig.toml preloads it, and renders a signal. A third runs under Node.js, installed by npm: React
 * rendered headless, an action fired, the state it changed shown, and two services of the device
 * answered. It needs the addon of Raven's
 * Node.js binding in the package of the platform, which Windows does not have yet.
 *
 * A last application has Solid 1, as one written before Solid 2 has it: the preload of Bun, and the
 * register of Node.js where it runs, must stop it and say to install Solid 2, which the package is
 * written for, or to stay on raven-tsx 0.3.x, which is written for Solid 1.
 */

import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import ts from "typescript";
import manifest from "../../package.json";
import { argument } from "./targets";

// (absolute: a path that holds ".." fails on Windows in some of what is done with it)
const root = resolve(`${import.meta.dir}/../..`);
const platform = resolve(argument("platform"));
const work = mkdtempSync(`${tmpdir()}/raven-tsx-consumer-`);

/** A command that failed: its message holds what it printed. */
class CommandFailed extends Error {}

/**
 * Runs a command in a folder and returns what it printed, or throws with that if it fails.
 * (a throw and no exit: the folder of the application is removed on the way out)
 */
async function run(command: readonly string[], cwd: string): Promise<string> {
	const child = Bun.spawn([...command], { cwd, stdout: "pipe", stderr: "pipe" });
	const [output, errors, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	if (code !== 0) {
		throw new CommandFailed(`check:consumer: ${command.join(" ")} failed in ${cwd}:\n${output}${errors}`);
	}
	return output;
}

/**
 * Runs a command that must fail saying each of `says`, before its application starts: throws if it
 * succeeds, says something else, or prints `started` (the application ran, and failed later on its own).
 */
async function refused(command: readonly string[], cwd: string, says: readonly string[], started: string): Promise<void> {
	const child = Bun.spawn([...command], { cwd, stdout: "pipe", stderr: "pipe" });
	const [output, errors, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	const printed = `${output}${errors}`;
	if (code === 0 || !says.every((each) => printed.includes(each)) || printed.includes(started)) {
		throw new CommandFailed(`check:consumer: ${command.join(" ")} in ${cwd} should stop before the application starts, saying "${says.join('" and "')}", and exited with ${code}:\n${printed}`);
	}
}

/** Packs a package folder as npm would, and returns the path of its tarball. */
async function pack(folder: string): Promise<string> {
	const name = (await run(["bun", "pm", "pack", "--quiet", "--destination", work], folder)).trim().split("\n").at(-1) ?? "";
	return name.startsWith("/") || /^[A-Za-z]:[\\/]/.test(name) ? name : `${work}/${name}`;
}

/** The compiler options of this package, which say what the sources must pass. */
function strictOptions(): Record<string, boolean> {
	const read = ts.readConfigFile(`${root}/tsconfig.json`, ts.sys.readFile);
	const options: Record<string, unknown> = read.config?.compilerOptions ?? {};
	return Object.fromEntries(Object.entries(options).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
}

/** The compiler options of `bun init`, with every setting this package holds its sources to. */
function compilerOptions(jsx: Readonly<Record<string, string>>, types: readonly string[]): Record<string, unknown> {
	return {
		lib: ["ESNext"],
		target: "ESNext",
		module: "Preserve",
		moduleDetection: "force",
		...jsx,
		allowJs: true,
		types,
		moduleResolution: "bundler",
		allowImportingTsExtensions: true,
		verbatimModuleSyntax: true,
		noEmit: true,
		skipLibCheck: true,
		noUncheckedIndexedAccess: true,
		...strictOptions(),
	};
}

/** Writes an application, installs the packages into it from their tarballs, and compiles it. */
async function makeApp(app: string, files: Readonly<Record<string, string>>, main: string, native: string, nativeName: string, dependencies: Readonly<Record<string, string>>, devDependencies: Readonly<Record<string, string>>): Promise<void> {
	const manifestOf = {
		name: "consumer",
		private: true,
		type: "module",
		dependencies: { [manifest.name]: `file:${main}`, ...dependencies },
		// (the platform package of this machine is the one just made, not one on npm)
		overrides: { [nativeName]: `file:${native}` },
		devDependencies: { "@types/bun": manifest.devDependencies["@types/bun"], typescript: manifest.devDependencies.typescript, ...devDependencies },
	};
	await Bun.write(`${app}/package.json`, JSON.stringify(manifestOf, null, 2));
	for (const [name, text] of Object.entries(files)) {
		await Bun.write(`${app}/${name}`, text);
	}
	await run(["bun", "install"], app);
	await run(["bun", "check", "--all"], app);
}

try {
	await run(["bun", "run", "src/tools/prepare-publish.ts", "--out", `${work}/npm`], root);
	const main = await pack(`${work}/npm/main`);
	const native = await pack(platform);
	const nativeName = (await Bun.file(`${platform}/package.json`).json()).name as string;
	const strict = Object.keys(strictOptions()).join(", ");

	const react = `${work}/react`;
	cpSync(`${root}/../../examples/helloworld/src`, `${react}/src`, { recursive: true });
	await makeApp(
		react,
		{
			"tsconfig.json": JSON.stringify({ compilerOptions: compilerOptions({ jsx: "react-jsx" }, ["bun"]), include: ["src"] }, null, 2),
			"src/optional.tsx": [
				'import { defineTheme } from "@decky.fx/raven-tsx";',
				'import { Button, Label, VBox } from "@decky.fx/raven-tsx/react";',
				"",
				"/** Optional props given a value that may be undefined, as `exactOptionalPropertyTypes` checks them. */",
				"export function Optional(props: { readonly tip?: string | undefined; readonly onClick?: (() => void) | undefined }) {",
				"\treturn (",
				'\t\t<VBox Name="optional" Tooltip={props.tip}>',
				"\t\t\t<Button OnClicked={props.onClick}>ok</Button>",
				'\t\t\t<Label Slot={{ Title: props.tip }}>text</Label>',
				"\t\t</VBox>",
				"\t);",
				"}",
				"",
				'export const theme = defineTheme({ Name: "optional", Accent: undefined, Styles: [{ Widget: "Button", Class: undefined }] });',
				"",
			].join("\n"),
		},
		main, native, nativeName,
		{ react: manifest.devDependencies.react, "react-reconciler": manifest.devDependencies["react-reconciler"] },
		{},
	);
	console.log(`installed ${manifest.name} and ${nativeName} from their tarballs into an application of React`);
	console.log(`it compiles with ${strict}`);
	const loaded = await run(["bun", "-e", `import { raven } from "${manifest.name}"; console.log(raven.Rget_version());`], react);
	console.log(`the library loads from ${nativeName}: Raven ${loaded.trim()}`);

	const solid = `${work}/solid`;
	cpSync(`${root}/../../examples/solid-helloworld/src`, `${solid}/src`, { recursive: true });
	await makeApp(
		solid,
		{
			"bunfig.toml": `preload = ["${manifest.name}/solid/preload"]\n`,
			"tsconfig.json": JSON.stringify({ compilerOptions: compilerOptions({ jsx: "preserve", jsxImportSource: `${manifest.name}/solid` }, ["bun"]), include: ["src"] }, null, 2),
			"src/optional.tsx": [
				'import { Button, Label, VBox } from "@decky.fx/raven-tsx/solid";',
				"",
				"/** Optional props given a value that may be undefined, as `exactOptionalPropertyTypes` checks them. */",
				"export function Optional(props: { readonly tip?: string | undefined; readonly onClick?: (() => void) | undefined }) {",
				"\treturn (",
				'\t\t<VBox Name="optional" Tooltip={props.tip}>',
				"\t\t\t<Button OnClicked={props.onClick}>ok</Button>",
				'\t\t\t<Label Slot={{ Title: props.tip }}>text</Label>',
				"\t\t</VBox>",
				"\t);",
				"}",
				"",
			].join("\n"),
			// (rendered without a window system or a GPU: a signal must reach the widget, once Solid
			// flushes: in Solid 2 a write is seen at the next microtask, or at `flush()`)
			"src/check.tsx": [
				'import { createSignal, flush } from "solid-js";',
				'import { createWindow, Label, raven as r, VBox } from "@decky.fx/raven-tsx/solid";',
				"",
				"const desc = new r.RInitDesc();",
				"desc.backend = r.R_BACKEND_NULL;",
				"desc.headless = 1;",
				"if (!r.Rinit_ex(desc)) {",
				'\tthrow new Error("Raven cannot start");',
				"}",
				"const [count, setCount] = createSignal(1);",
				'const { window, root } = createWindow({ Title: "check", Width: 200, Height: 100 });',
				'root.render(() => <VBox><Label Name="count">{count()}</Label></VBox>);',
				"setCount(2);",
				"flush();",
				'const shown = r.Rlabel_get_text(r.Rwidget_find(window, "count"));',
				"root.unmount();",
				"r.Rwindow_destroy(window);",
				"r.Rshutdown();",
				'if (shown !== "2") {',
				'\tthrow new Error(`the label shows ${shown}, not what its signal says`);',
				"}",
				'console.log(r.Rget_version());',
				"",
			].join("\n"),
		},
		main, native, nativeName,
		{ "solid-js": manifest.devDependencies["solid-js"], "@solidjs/universal": manifest.devDependencies["@solidjs/universal"] },
		{ "@solidjs/compiler": manifest.devDependencies["@solidjs/compiler"] },
	);
	console.log(`installed ${manifest.name} and ${nativeName} from their tarballs into an application of Solid`);
	console.log(`it compiles with ${strict}`);
	const rendered = await run(["bun", "run", "src/check.tsx"], solid);
	console.log(`a signal reaches its widget, through the plugin of the package: Raven ${rendered.trim()}`);

	// (Solid 1, as an application written before Solid 2 has it: the application must stop at the
	// preload and say why, and which version of this package is written for Solid 1, not fail at its
	// first import of Solid)
	const solid1 = `${work}/solid1`;
	const solid1Says = ["@decky.fx/raven-tsx/solid supports Solid 2, not solid-js 1.", "For Solid 1, use raven-tsx 0.3.x: npm install @decky.fx/raven-tsx@0.3"];
	const solid1Started = "consumer-solid1: the application started";
	await Bun.write(`${solid1}/package.json`, JSON.stringify({
		name: "consumer-solid1",
		private: true,
		type: "module",
		dependencies: { [manifest.name]: `file:${main}`, "solid-js": "^1.9" },
		overrides: { [nativeName]: `file:${native}` },
	}, null, 2));
	await Bun.write(`${solid1}/bunfig.toml`, `preload = ["${manifest.name}/solid/preload"]\n`);
	// (an entry with no JSX, which the plugin does not compile, says it started, then imports a source
	// of Solid and so the renderer, which a Solid 1 makes fail on its own: the check must stop it
	// before, so the message is never printed)
	await Bun.write(`${solid1}/src/index.ts`, `console.log("${solid1Started}");\nawait import("./app.tsx");\n`);
	await Bun.write(`${solid1}/src/app.tsx`, `import { Label } from "${manifest.name}/solid";\nexport const app = () => <Label>never</Label>;\n`);
	await run(["bun", "install"], solid1);
	await refused(["bun", "run", "src/index.ts"], solid1, solid1Says, solid1Started);
	console.log("with Solid 1 installed, the preload stops, says to install Solid 2, and names raven-tsx 0.3.x for Solid 1");

	if (existsSync(`${platform}/raven_napi.node`)) {
		const node = `${work}/node`;
		const nodeManifest = {
			name: "consumer-node",
			private: true,
			type: "module",
			dependencies: { [manifest.name]: `file:${main}`, react: manifest.devDependencies.react, "react-reconciler": manifest.devDependencies["react-reconciler"] },
			// (no types of Bun: the declarations for Node.js name none)
			devDependencies: { "@types/node": "^26", "@types/react": manifest.dependencies["@types/react"], typescript: manifest.devDependencies.typescript },
			overrides: { [nativeName]: `file:${native}` },
		};
		// (resolved as Node.js resolves, "NodeNext": the condition "node" gives the declarations of dist/types)
		await Bun.write(`${node}/tsconfig.json`, JSON.stringify({
			compilerOptions: { target: "ESNext", module: "NodeNext", moduleResolution: "NodeNext", types: ["node"], noEmit: true, skipLibCheck: true, ...strictOptions() },
			include: ["types.ts"],
		}, null, 2));
		await Bun.write(`${node}/types.ts`, [
			'import { createElement } from "react";',
			'import { raven as r } from "@decky.fx/raven-tsx";',
			'import { Button, createWindow, type WidgetInstance } from "@decky.fx/raven-tsx/react";',
			"",
			"/** What an application of Node.js writes, typed. */",
			"export function open(onPress: () => void): r.Rid {",
			'	const { window, root } = createWindow({ Title: "typed", Width: 200, Height: 100 });',
			'	root.render(createElement(Button, { OnClicked: onPress, ref: (made: WidgetInstance | null) => void made?.focus() }, "ok"));',
			"	return window;",
			"}",
			"",
			"// (the types are real, not any: a prop a Button does not have is refused)",
			"// @ts-expect-error",
			'createElement(Button, { NoSuchProp: 1 }, "no");',
			"",
		].join("\n"));
		await Bun.write(`${node}/package.json`, JSON.stringify(nodeManifest, null, 2));
		await Bun.write(`${node}/check.mjs`, [
			'import { createElement as h, useState } from "react";',
			'import { raven as r, requestPermission, takePhoto } from "@decky.fx/raven-tsx";',
			'import { Button, createWindow, Label, VBox } from "@decky.fx/raven-tsx/react";',
			"",
			"const desc = new r.RInitDesc();",
			"desc.backend = r.R_BACKEND_NULL;",
			"desc.headless = 1;",
			"if (!r.Rinit_ex(desc)) {",
			'	throw new Error("Raven cannot start");',
			"}",
			"function App() {",
			"	const [count, setCount] = useState(0);",
			'	return h(VBox, null, h(Label, { Name: "count" }, String(count)), h(Button, { Name: "add", OnClicked: () => setCount((value) => value + 1) }, "add"));',
			"}",
			'const { window, root } = createWindow({ Title: "check", Width: 200, Height: 100 });',
			"root.render(h(App));",
			"const settle = async () => {",
			"	for (let turn = 0; turn < 20; turn++) {",
			"		r.Rdraw_frame();",
			"		await new Promise((resolve) => setImmediate(resolve));",
			"	}",
			"};",
			"await settle();",
			'const add = r.Rwidget_find(window, "add");',
			"r.Raction_fire(r.Rwidget_get_action(add), add);",
			"await settle();",
			'const shown = r.Rlabel_get_text(r.Rwidget_find(window, "count"));',
			"// (the services of the device, answered at a later frame through the addon: none of them on a desktop)",
			'const asked = Promise.all([requestPermission("camera"), takePhoto()]);',
			"await settle();",
			"const [camera, photo] = await asked;",
			'if (camera !== "unsupported" || photo.result !== "unsupported") {',
			'	throw new Error(`the camera is ${camera}, and a photo ${photo.result}, on a desktop`);',
			"}",
			"root.unmount();",
			"r.Rwindow_destroy(window);",
			"r.Rshutdown();",
			'if (shown !== "1") {',
			'	throw new Error(`the label shows ${shown}, not what the click changed`);',
			"}",
			"console.log(r.Rget_version());",
			"",
		].join("\n"));
		await run(["npm", "install", "--no-audit", "--no-fund"], node);
		await run(["npx", "tsc", "-p", "."], node);
		console.log("its TypeScript compiles, resolved as Node.js resolves (NodeNext), without the types of Bun, with " + Object.keys(strictOptions()).join(", "));
		const clicked = await run(["node", "check.mjs"], node);
		console.log(`installed by npm, React runs under Node.js, and a click reaches its state: Raven ${clicked.trim()}`);

		// (Solid under Node.js: the check of the application of Solid on Bun, as it is, run through the register)
		const nodeSolid = `${work}/node-solid`;
		cpSync(`${solid}/src/check.tsx`, `${nodeSolid}/src/check.tsx`);
		await Bun.write(`${nodeSolid}/package.json`, JSON.stringify({
			name: "consumer-node-solid",
			private: true,
			type: "module",
			dependencies: { [manifest.name]: `file:${main}`, "solid-js": manifest.devDependencies["solid-js"], "@solidjs/universal": manifest.devDependencies["@solidjs/universal"] },
			devDependencies: { "@solidjs/compiler": manifest.devDependencies["@solidjs/compiler"] },
			overrides: { [nativeName]: `file:${native}` },
		}, null, 2));
		await run(["npm", "install", "--no-audit", "--no-fund"], nodeSolid);
		const signalled = await run(["node", "--import", `${manifest.name}/solid/register`, "src/check.tsx"], nodeSolid);
		console.log(`installed by npm, Solid runs under Node.js through its register, and a signal reaches its widget: Raven ${signalled.trim()}`);

		// (the application with Solid 1, run by Node.js: the register stops it as the preload does)
		await refused(["node", "--import", `${manifest.name}/solid/register`, "src/index.ts"], solid1, solid1Says, solid1Started);
		console.log("with Solid 1 installed, the register of Node.js stops too, says to install Solid 2, and names raven-tsx 0.3.x");
	} else {
		console.log(`${nativeName} has no addon of the Node.js binding: nothing runs under Node.js here`);
	}
} catch (error) {
	// (a failed command says what it printed; anything else keeps its stack)
	console.error(error instanceof CommandFailed ? error.message : error);
	process.exitCode = 1;
} finally {
	rmSync(work, { recursive: true, force: true });
}
