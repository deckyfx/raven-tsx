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

/** Functions of a library the binding does not have, `raven_web.h`: Raven's addon has none of them yet. */
export function openLibrary<S extends Record<string, FFIFunction>>(_path: string, _symbols: S): ConvertFns<S> {
	return RavenError.throw("raven-tsx: web pages (WebView) need Bun for now: Raven's Node.js binding does not have raven_web.h");
}

/** A function of C given by its address: Node.js has no way to call one. */
export function callFunction(_address: Pointer, _seconds: number, _userData: Pointer | null): void {
	RavenError.throw("raven-tsx: a frame callback of C, given by its address, needs Bun");
}

/** What an application gives as user data, passed on as it is: Raven's addon reads it. */
export function addressOf(userData: Pointer | NodeJS.TypedArray | null): Pointer | null {
	return userData as Pointer | null;
}

/** The address of bytes C gave, as a view of them: a structure read where it is, as the addon gives it. */
export function addressOfView(view: Uint8Array): Pointer {
	// (the binding of Node.js has `ptr`, as bun:ffi does: the types of #raven are those of Bun's binding)
	return (raven as unknown as { ptr(view: Uint8Array): Pointer }).ptr(view);
}
