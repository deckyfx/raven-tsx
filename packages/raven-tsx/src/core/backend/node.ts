/**
 * The backend of Node.js: the function itself, which Raven's addon calls with what C gives already
 * decoded (a text as a string, a float to write as a Float32Array, a structure as its class), and
 * keeps as long as Raven may call it.
 */

import type { ConvertFns, FFIFunction, Pointer } from "bun:ffi";
// (the library found first, as the binding opens it as it loads)
import "#native";
import * as raven from "#raven";
import { RavenError } from "../errors";
import type { NativeArg, NativeCallback, NativeResult, NativeReturn, NativeValue } from "./types";

/** A function C can call: see the backend of Bun, which this one behaves as. */
export function nativeCallback(args: readonly NativeArg[], returns: NativeReturn, run: (...values: NativeValue[]) => NativeResult, withUserData = false): NativeCallback {
	const callback = (...values: NativeValue[]): number | string | void => {
		// (the addon gives the user data last, as an address, or null)
		const result = withUserData ? run(...values.slice(0, args.length), values[args.length] ?? null) : run(...values);
		if (returns === "text") {
			return typeof result === "string" ? result : "";
		}
		if (returns === "i32" || returns === "u32") {
			return typeof result === "number" ? result : 0;
		}
	};
	// (a setter of the binding takes a function where C takes a callback: the type says an address,
	// as the core passes the same value on Bun)
	return callback as never as NativeCallback;
}

/** What raven-tsx uses of `node:ffi`, experimental in Node.js: its types are not in those of Bun. */
interface NodeFfi {
	readonly DynamicLibrary: new (path: string) => NodeLibrary;
	toString(pointer: bigint): string;
}

/** A signature, as `node:ffi` writes it. */
interface NodeSignature {
	readonly return: string;
	readonly arguments: readonly string[];
}

interface NodeLibrary {
	getFunction(name: string, signature: NodeSignature): (...args: unknown[]) => unknown;
	registerCallback(signature: NodeSignature, run: (...args: unknown[]) => unknown): bigint;
}

/** The types of bun:ffi that raven_web.h needs, as `node:ffi` names them. A text is an address, read by hand. */
const NODE_TYPES: Readonly<Record<string, string>> = {
	void: "void", i32: "int32", int32_t: "int32", u32: "uint32", uint32_t: "uint32", f32: "float32", float: "float32",
	f64: "float64", double: "float64", ptr: "pointer", pointer: "pointer", function: "pointer", cstring: "pointer",
};

/** `node:ffi`, the foreign functions of Node.js: there since 26, and experimental (it says so once, on stderr). */
function nodeFfi(): NodeFfi {
	const ffi = process.getBuiltinModule?.("node:ffi") as NodeFfi | undefined;
	return ffi ?? RavenError.throw(`raven-tsx: web pages (WebView) on Node.js need node:ffi, which Node.js ${process.version} does not have (26.9 and newer have it; 26.1 to 26.8 with --experimental-ffi; --allow-ffi with the permission model). Raven's Node.js binding does not have raven_web.h`);
}

/** The libraries opened, by path: `node:ffi` refuses a function asked again with another signature. */
const nodeLibraries = new Map<string, NodeLibrary>();

function nodeLibrary(path: string): NodeLibrary {
	let library = nodeLibraries.get(path);
	if (!library) {
		library = new (nodeFfi().DynamicLibrary)(path);
		nodeLibraries.set(path, library);
	}
	return library;
}

function nodeType(type: unknown): string {
	return NODE_TYPES[String(type)] ?? RavenError.throw(`raven-tsx: no type of node:ffi for "${String(type)}"`);
}

/**
 * An argument for an address: what bun:ffi takes there (a typed array, an address as a number,
 * null) or what Raven's addon gives (a bigint), as node:ffi takes it.
 */
function nodePointer(value: unknown): unknown {
	if (value === undefined || value === null || value === 0 || value === 0n) {
		return null;
	}
	return typeof value === "number" ? BigInt(value) : value;
}

/**
 * Functions of a library the binding does not have, `raven_web.h`, through `node:ffi`: called as
 * bun:ffi calls them, a text a buffer that ends with a zero, a callback an address (`webCallback`),
 * and a text returned a string, or null.
 */
export function openLibrary<S extends Record<string, FFIFunction>>(path: string, symbols: S): ConvertFns<S> {
	const library = nodeLibrary(path);
	const ffi = nodeFfi();
	const functions: Record<string, (...args: unknown[]) => unknown> = {};
	for (const [name, definition] of Object.entries(symbols)) {
		const args = [...(definition.args ?? [])].map(nodeType);
		const returns = String(definition.returns ?? "void");
		const call = library.getFunction(name, { return: nodeType(returns), arguments: args });
		functions[name] = (...values: unknown[]): unknown => {
			const result = call(...values.map((value, index) => (args[index] === "pointer" ? nodePointer(value) : value)));
			if (returns === "cstring") {
				return typeof result === "bigint" && result !== 0n ? ffi.toString(result) : null;
			}
			return typeof result === "bigint" ? Number(result) : result;
		};
	}
	return functions as never as ConvertFns<S>;
}

/** A text C gives a callback of node:ffi: an address, read at once. */
function nodeText(value: unknown): string | null {
	return typeof value === "bigint" && value !== 0n ? nodeFfi().toString(value) : null;
}

/**
 * A function of C a library outside the binding calls (`raven_web.h`): its address, and it lives for
 * ever. On Node.js it is made by `node:ffi`, in the library at `path`; what C gives is decoded as
 * for `nativeCallback`, and the user data is not read. An exception is said and goes no further:
 * node:ffi would end the process.
 */
export function foreignCallback(path: string, args: readonly NativeArg[], returns: "void" | "i32", run: (...values: NativeValue[]) => NativeResult): Pointer {
	const signature: NodeSignature = {
		return: returns === "void" ? "void" : "int32",
		arguments: [...args.map((arg) => (arg === "text" || arg === "pointer" ? "pointer" : nodeType(arg))), "pointer"],
	};
	const address = nodeLibrary(path).registerCallback(signature, (...raw: unknown[]): unknown => {
		try {
			const values = args.map((arg, index): NativeValue => {
				const value = raw[index];
				return arg === "text" ? nodeText(value) : typeof value === "bigint" ? (Number(value) as Pointer) : (value as NativeValue);
			});
			const result = run(...values);
			return returns === "i32" ? (typeof result === "number" ? result : 0) : undefined;
		} catch (error) {
			console.error("raven-tsx: exception in a callback of C:", error);
			return returns === "i32" ? 0 : undefined;
		}
	});
	return Number(address) as Pointer;
}

/** A function of C given by its address: Node.js has no way to call one. */
export function callFunction(_address: Pointer | bigint | number, _seconds: number, _userData: Pointer | null): void {
	RavenError.throw("raven-tsx: a frame callback of C, given by its address, needs Bun");
}

/** What an application gives as user data, passed on as it is: Raven's addon reads it. */
export function addressOf(userData: Pointer | bigint | number | NodeJS.TypedArray | null): Pointer | null {
	return userData as Pointer | null;
}

/**
 * Where each picked file came from in the memory of the library. The addon gives the address and
 * the binding makes the structure (`RPickedFile.from`), which on a runtime that forbids views of
 * that memory (Electron) is a copy of the first file only: the others are read from this address.
 */
const pickedAt = new WeakMap<object, Pointer>();
{
	const picked = raven.RPickedFile as unknown as { from(pointer: Pointer | null): object | null };
	const from = picked.from.bind(picked);
	picked.from = (pointer) => {
		const made = from(pointer);
		if (made && pointer) {
			pickedAt.set(made, pointer);
		}
		return made;
	};
}

/** The address of a structure C gave, where it is in the memory of the library (not of a copy of it). */
export function addressOfStruct(struct: { readonly _bytes: Uint8Array }): Pointer {
	// (the binding of Node.js has `ptr`, as bun:ffi does: the types of #raven are those of Bun's binding,
	// and the address is a bigint)
	return pickedAt.get(struct) ?? (raven as unknown as { ptr(view: Uint8Array): Pointer }).ptr(struct._bytes);
}

/** An address `bytes` after another: on Node.js a bigint, as Raven's addon gives addresses (a number is taken too). */
export function addressAt(address: Pointer, bytes: number): Pointer {
	return (BigInt(address) + BigInt(bytes)) as never as Pointer;
}
