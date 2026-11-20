/** The lines of compiled Solid put back on those of the source, as Bun reads no source map of a plugin. */

import { expect, test } from "bun:test";
import { solidCompiler } from "../../solid/compile";
import { lineEnds, retainLines, sourceLines } from "../../solid/lines";

/** A source map whose code line `index` starts on source line `lines[index]` (undefined: none). */
function mapOf(lines: readonly (number | undefined)[]): string {
	const vlq = (value: number): string => {
		const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		let rest = value < 0 ? (-value << 1) | 1 : value << 1;
		let out = "";
		do {
			let digit = rest & 31;
			rest >>>= 5;
			if (rest > 0) {
				digit |= 32;
			}
			out += BASE64.charAt(digit);
		} while (rest > 0);
		return out;
	};
	let previous = 0;
	const mappings = lines
		.map((line) => {
			if (line === undefined) {
				return "";
			}
			const piece = `A${vlq(0)}${vlq(line - previous)}A`;
			previous = line;
			return piece;
		})
		.join(";");
	return JSON.stringify({ version: 3, sources: ["a.tsx"], names: [], mappings });
}

test("the source line of each code line is read from the map, relative through the whole map", () => {
	expect(sourceLines(JSON.parse(mapOf([0, undefined, 4, 4, 2, 40])).mappings, 6)).toEqual([0, undefined, 4, 4, 2, 40]);
	// (several pieces on a line: the first that has a source counts; a line past the code is not given)
	expect(sourceLines("AAAA,EAEE;AACA", 2)).toEqual([0, 3]);
	expect(sourceLines("AAAA;AACA;AACA", 2)).toEqual([0, 1]);
});

test("a line break inside a text or a comment of several lines is part of it", () => {
	const ends = (code: string): boolean[] => [...lineEnds(code).open];
	expect(ends("a = `x\ny`;\nb")).toEqual([true, false, false]);
	expect(ends("a = `${f(`\n`)}\n`;")).toEqual([true, true, false]);
	expect(ends("a = `${ {b: 1}.b }\nc`")).toEqual([true, false]);
	expect(ends("/* a\n*/ b\nc")).toEqual([true, false, false]);
	expect(ends("a = 'x\\\ny';\nb")).toEqual([true, false, false]);
	expect(ends("a = \"x\\\ny\";\nb")).toEqual([true, false, false]);
});

test("a slash after a value divides; elsewhere it starts a regular expression, whose text holds quotes", () => {
	const ends = (code: string): boolean[] => [...lineEnds(code).open];
	// (a quote in a regular expression starts no string: the line after is code)
	expect(ends("a = /'/.test(b);\nc")).toEqual([false, false]);
	expect(ends("a = /[/']/.test(b);\nc")).toEqual([false, false]);
	expect(ends("return /`/;\nc")).toEqual([false, false]);
	// (a division: what follows is code, its quote a string that ends on the line)
	expect(ends("a = b / c; d = '`';\ne")).toEqual([false, false]);
	expect(ends("a = f(x) / 2 + '`';\ne")).toEqual([false, false]);
	expect(ends("a = b! / 2 + '`';\ne")).toEqual([false, false]);
});

test("a line comment ends its line: what comes after goes on the next", () => {
	const { comment } = lineEnds("a // x\nb\n'//' + c\n#!no");
	expect([...comment]).toEqual([true, false, false, false]);
	expect([...lineEnds("#!/usr/bin/env bun\na").comment]).toEqual([true, false]);
});

test("each line goes to its source's line: later ones get blank lines before, the compiler's own join the line before", () => {
	const code = ["import x;", "const a = f(", "1,", "2);", "g();"].join("\n");
	expect(retainLines(code, mapOf([0, 3, undefined, 3, 5])).split("\n")).toEqual(["import x;", "", "", "const a = f( 1, 2);", "", "g();"]);
});

test("a line break in a text, or after a line comment, stays where joining would change the code", () => {
	const code = ["a = `x", "y`;", "b(); // c", "d();"].join("\n");
	// (all from the first line: the break in the text and the one after the comment stay, the closed text's line joins)
	expect(retainLines(code, mapOf([0, 0, 0, 0]))).toBe(["a = `x", "y`; b(); // c", "d();"].join("\n"));
});

test("compiled TSX keeps each expression on the line of its source", async () => {
	const compile = await solidCompiler();
	const source = [
		'import { createSignal, Show } from "solid-js";',
		"",
		"export function App(props: { readonly items: readonly string[] }) {",
		"	const [n, setN] = createSignal<number>(0);",
		"	return (",
		"		<VBox Spacing={4}>",
		'			<Button Text={"n=" + n()} OnClicked={() => setN(n() + 1)} />',
		"			<Show when={n() > 1}>",
		"				<Label Text={`big ${n()}`} />",
		"			</Show>",
		"			{props.items.map((item) => <Label Text={item} />)}",
		"			{MARKER_ELEVEN}",
		"		</VBox>",
		"	);",
		"}",
		"export const LAST = MARKER_SIXTEEN;",
	].join("\n");
	const { code, map } = compile(source, "/app/App.tsx");
	expect(map).not.toBeNull();
	const retained = retainLines(code, map ?? "");
	const lines = retained.split("\n");
	expect(lines.findIndex((line) => line.includes("MARKER_ELEVEN"))).toBe(11);
	expect(lines.findIndex((line) => line.includes("MARKER_SIXTEEN"))).toBe(15);
	expect(lines.findIndex((line) => line.includes('"n=" + n()'))).toBe(6);
	// (the same program for Bun: only whitespace moved)
	const transpiler = new Bun.Transpiler({ loader: "ts", minifyWhitespace: true });
	expect(transpiler.transformSync(retained)).toBe(transpiler.transformSync(code));
});
