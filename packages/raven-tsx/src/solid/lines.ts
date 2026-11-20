/**
 * Puts each line of compiled code back on the line of the source it comes from, as Babel's
 * `retainLines` did: Bun reads no source map that a plugin gives, so an error says the line of what
 * it runs. The source map of the compiler says where each line comes from; the code only changes
 * at its line breaks, where it is not in a text (a template, a string) and no comment ends there:
 * a line break becomes several, or a space.
 */

/** The digits of a source map's numbers: base64. */
const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * The line of the source that each line of the code starts with (that of its first piece that has
 * one), from the `mappings` of a source map (version 3): undefined for a line of the compiler's own.
 */
export function sourceLines(mappings: string, lineCount: number): (number | undefined)[] {
	const lines: (number | undefined)[] = Array.from({ length: lineCount }, () => undefined);
	// (the line of the source is relative to the one before, through the whole map)
	let sourceLine = 0;
	let line = 0;
	let fields: number[] = [];
	let value = 0;
	let shift = 0;
	/** Ends a piece: its fields are the column, then the source, its line and its column, and a name. */
	const endPiece = (): void => {
		if (fields.length >= 4) {
			sourceLine += fields[2] ?? 0;
			if (line < lineCount && lines[line] === undefined) {
				lines[line] = sourceLine;
			}
		}
		fields = [];
	};
	for (const character of mappings) {
		if (character === ";" || character === ",") {
			endPiece();
			if (character === ";") {
				line++;
			}
			continue;
		}
		const digit = BASE64.indexOf(character);
		if (digit < 0) {
			continue;
		}
		// (a number in VLQ: five bits a digit, the sixth says that more come, the lowest bit of all is the sign)
		value += (digit & 31) << shift;
		if (digit & 32) {
			shift += 5;
		} else {
			fields.push(value & 1 ? -(value >>> 1) : value >>> 1);
			value = 0;
			shift = 0;
		}
	}
	endPiece();
	return lines;
}

/** Words after which a `/` starts a regular expression, not a division. */
const BEFORE_REGEX = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

/** A character of a name: what ends a value before a `/` that divides. */
const isNameCharacter = (character: string): boolean => /[\w$]/.test(character);

/** What each line ends in: a text or a comment that goes on (a line break there is part of it), or a line comment. */
export interface LineEnds {
	/** The line ends inside a template, a string, a comment of several lines or a regular expression. */
	readonly open: readonly boolean[];
	/** The line ends with a comment of `//` (or `#!`): what is put after it would be comment too. */
	readonly comment: readonly boolean[];
}

/** Reads code as a tokenizer would, as far as texts and comments go, and says how each line ends. */
export function lineEnds(code: string): LineEnds {
	type Mode = "code" | "single" | "double" | "template" | "block" | "line" | "regex" | "class";
	const open: boolean[] = [];
	const comment: boolean[] = [];
	let mode: Mode = code.startsWith("#!") ? "line" : "code";
	// (the depth of braces in code, and that of each `${` of a template it is in)
	let depth = 0;
	const templates: number[] = [];
	// (the two last characters of code that are not spaces, and the name the last one ends)
	let last = "";
	let beforeLast = "";
	let word = "";
	let lastWord = "";
	for (let index = 0; index < code.length; index++) {
		const character = code.charAt(index);
		if (character === "\n") {
			open.push(mode !== "code" && mode !== "line");
			comment.push(mode === "line");
			// (a line comment ends here; a regular expression cannot go on: the code was not one)
			if (mode === "line" || mode === "regex" || mode === "class") {
				mode = "code";
			}
			if (word !== "") {
				lastWord = word;
				word = "";
			}
			continue;
		}
		switch (mode) {
			case "line":
				break;
			case "block":
				if (character === "*" && code.charAt(index + 1) === "/") {
					mode = "code";
					index++;
				}
				break;
			case "single":
			case "double":
			case "template":
			case "regex":
			case "class":
				if (character === "\\") {
					// (an escape takes the next character, but a line break, which the next turn counts)
					if (code.charAt(index + 1) !== "\n") {
						index++;
					}
				} else if ((mode === "single" && character === "'") || (mode === "double" && character === '"')) {
					mode = "code";
					last = character;
				} else if (mode === "template" && character === "`") {
					mode = "code";
					last = character;
				} else if (mode === "template" && character === "$" && code.charAt(index + 1) === "{") {
					templates.push(depth);
					depth++;
					index++;
					mode = "code";
					last = "{";
				} else if (mode === "regex" && character === "[") {
					mode = "class";
				} else if (mode === "class" && character === "]") {
					mode = "regex";
				} else if (mode === "regex" && character === "/") {
					mode = "code";
					last = "/";
					beforeLast = "";
				}
				break;
			case "code": {
				if (isNameCharacter(character)) {
					word += character;
					beforeLast = last;
					last = character;
					break;
				}
				if (word !== "") {
					lastWord = word;
					word = "";
				}
				if (/\s/.test(character)) {
					break;
				}
				const next = code.charAt(index + 1);
				if (character === "/" && next === "/") {
					mode = "line";
					break;
				}
				if (character === "/" && next === "*") {
					mode = "block";
					index++;
					break;
				}
				if (character === "/") {
					// (after a value it divides: a name that is no keyword, a number, a closing bracket, a
					// text, or a `!` of TypeScript after one of them; elsewhere it starts a regular expression)
					const value = (sign: string): boolean => /[\w$)\]}'"`]/.test(sign);
					const divides = last !== "" && ((isNameCharacter(last) ? !BEFORE_REGEX.has(lastWord) : value(last)) || (last === "!" && value(beforeLast)));
					if (!divides) {
						mode = "regex";
						break;
					}
				} else if (character === "'") {
					mode = "single";
				} else if (character === '"') {
					mode = "double";
				} else if (character === "`") {
					mode = "template";
				} else if (character === "{") {
					depth++;
				} else if (character === "}") {
					depth--;
					if (templates.length > 0 && depth === templates[templates.length - 1]) {
						templates.pop();
						mode = "template";
					}
				}
				beforeLast = last;
				last = character;
				lastWord = "";
				break;
			}
		}
	}
	open.push(mode !== "code" && mode !== "line");
	comment.push(mode === "line");
	return { open, comment };
}

/**
 * The code with each line moved to the line of the source it comes from, as far as it can go:
 * a line of the compiler's own, or one whose source comes before where the code is, goes on the
 * line before it; one whose source comes later gets blank lines before it. A line break inside a
 * text or a comment, or after a line comment, stays as it is.
 */
export function retainLines(code: string, map: string): string {
	const lines = code.split(/\r?\n/);
	const { mappings } = JSON.parse(map) as { readonly mappings: string };
	const sources = sourceLines(mappings, lines.length);
	const { open, comment } = lineEnds(lines.join("\n"));
	// (the first line too: blank lines before it, but before a `#!`, which must be first)
	const first = sources[0] ?? 0;
	let at = lines[0]?.startsWith("#!") ? 0 : first;
	let result = "\n".repeat(at) + (lines[0] ?? "");
	for (let index = 1; index < lines.length; index++) {
		const line = lines[index] ?? "";
		const source = sources[index];
		if (open[index - 1]) {
			result += `\n${line}`;
			at++;
		} else if (source !== undefined && source > at) {
			result += "\n".repeat(source - at) + line;
			at = source;
		} else if (comment[index - 1]) {
			result += `\n${line}`;
			at++;
		} else {
			const joined = line.trimStart();
			result += joined === "" ? "" : ` ${joined}`;
		}
	}
	return result;
}
