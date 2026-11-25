/**
 * Web pages in a widget: `raven_web.h`, which is not in the binding, as a library can be built
 * without it (`-DRAVEN_BUILD_WEB=OFF`) and the binding needs all it declares in order to start.
 * So nothing is opened here until it is asked for: with bun:ffi on Bun, and on Node.js with
 * `node:ffi` (Node.js 26), as Raven's Node.js binding does not have raven_web.h.
 *
 *     await runApp(<WebView Url="https://example.com" Slot={{ Fill: 1 }} />, options, { setup: registerWebView });
 */

import type { ConvertFns, Pointer } from "bun:ffi";
import { foreignCallback, openLibrary } from "#backend";
import { eventScope } from "./events";
import * as r from "./raven";
import { RavenError } from "./errors";
import type { CustomProps } from "./props.generated";

const SYMBOLS = {
	Rweb_is_available: { args: [], returns: "i32" },
	Rweb_set_browser_path: { args: ["ptr"], returns: "void" },
	Rweb_get_browser_path: { args: [], returns: "cstring" },
	Rweb_set_profile_folder: { args: ["ptr"], returns: "void" },
	Rweb_set_browser_arguments: { args: ["ptr"], returns: "void" },
	Rweb_register_xml: { args: [], returns: "void" },
	Rweb_shutdown: { args: [], returns: "void" },
	Rweb_view_create: { args: [], returns: "u32" },
	Rweb_view_is_valid: { args: ["u32"], returns: "i32" },
	Rweb_view_load_url: { args: ["u32", "ptr"], returns: "void" },
	Rweb_view_load_file: { args: ["u32", "ptr"], returns: "void" },
	Rweb_view_load_html: { args: ["u32", "ptr", "ptr"], returns: "void" },
	Rweb_view_reload: { args: ["u32"], returns: "void" },
	Rweb_view_stop: { args: ["u32"], returns: "void" },
	Rweb_view_go_back: { args: ["u32"], returns: "void" },
	Rweb_view_go_forward: { args: ["u32"], returns: "void" },
	Rweb_view_can_go_back: { args: ["u32"], returns: "i32" },
	Rweb_view_can_go_forward: { args: ["u32"], returns: "i32" },
	Rweb_view_get_url: { args: ["u32"], returns: "cstring" },
	Rweb_view_get_title: { args: ["u32"], returns: "cstring" },
	Rweb_view_is_loading: { args: ["u32"], returns: "i32" },
	Rweb_view_is_ready: { args: ["u32"], returns: "i32" },
	Rweb_view_get_error: { args: ["u32"], returns: "cstring" },
	Rweb_view_get_texture: { args: ["u32"], returns: "u32" },
	Rweb_view_set_zoom: { args: ["u32", "f32"], returns: "void" },
	Rweb_view_get_zoom: { args: ["u32"], returns: "f32" },
	Rweb_view_set_frames: { args: ["u32", "i32", "i32"], returns: "void" },
	Rweb_view_run_javascript: { args: ["u32", "ptr", "ptr", "ptr"], returns: "void" },
	Rweb_view_set_message_callback: { args: ["u32", "ptr", "ptr"], returns: "void" },
	Rweb_view_set_event_callback: { args: ["u32", "ptr", "ptr"], returns: "void" },
} as const;

/**
 * The props of every widget, and what `<WebView>` takes in XML. Not `OnEvent`: a widget has one
 * event callback, and this one forwards the mouse and the keys to the page.
 */
export type WebViewProps = Omit<CustomProps, "OnPaint" | "OnMeasure" | "OnEvent"> & {
	readonly Url?: string | undefined;
	/** A file: it can also be given by `Url` as `file://...`. */
	readonly Source?: string | undefined;
	readonly Html?: string | undefined;
	readonly Zoom?: number | undefined;
	readonly Frames?: "Jpeg" | "Png" | undefined;
	readonly Quality?: number | undefined;
	/** Fired when the page changes: read it through a ref, with `webFunctions`. */
	readonly OnChanged?: string | (() => void) | undefined;
};

let opened: ConvertFns<typeof SYMBOLS> | null = null;

/** The library, which `native.ts` and `native-node.ts` found. */
function libraryPath(): string {
	const library = process.env["RAVEN_LIBRARY"];
	if (r.Rget_version() === null || !library) {
		RavenError.throw("raven-tsx: RAVEN_LIBRARY should say where the library is, and it does not");
	}
	return library;
}

/**
 * The functions of `raven_web.h`, as bun:ffi gives them: a text is a `Buffer` that ends with a
 * zero, a callback the address `webCallback` gives. On Node.js a text they return is a string.
 */
export function webFunctions(): NonNullable<typeof opened> {
	if (!opened) {
		const library = libraryPath();
		try {
			opened = openLibrary(library, SYMBOLS);
		} catch (error) {
			// (the backend says itself why it cannot: a Node.js without node:ffi)
			if (error instanceof RavenError) {
				throw error;
			}
			RavenError.throw(`raven-tsx: this library has no web pages: build Raven without -DRAVEN_BUILD_WEB=OFF (${error instanceof Error ? error.message : String(error)})`);
		}
	}
	return opened;
}

/** Makes `<WebView>` a tag Raven knows: once, after Raven started, as the `setup` of `runApp`. */
export function registerWebView(): void {
	webFunctions().Rweb_register_xml();
}

/** What `webCallback` makes, by kind: what the page sends, what happens in it, the answer of a script. */
export interface WebCallbacks {
	/** `Rweb_view_set_message_callback`: what the page sent with `window.raven.postMessage`. */
	readonly message: (view: r.Rid, message: string) => void;
	/** `Rweb_view_set_event_callback`: an `RWebEvent` of raven_web.h (loaded, navigated...). */
	readonly event: (view: r.Rid, event: number) => void;
	/** `Rweb_view_run_javascript`: the value of the script, or why it failed. */
	readonly result: (view: r.Rid, result: string | null, error: string | null) => void;
}

/**
 * A callback for the functions of `raven_web.h` that take one, on Bun and on Node.js: its address,
 * which lives for ever, so make one and keep it. The function runs as a prop does: an exception
 * stays on this side, and what it changes is committed before the next event.
 *
 *     web.Rweb_view_set_message_callback(page.widget, webCallback("message", (_view, text) => setLast(text)), null);
 */
export function webCallback<K extends keyof WebCallbacks>(kind: K, run: WebCallbacks[K]): Pointer {
	const library = libraryPath();
	const call = (...values: unknown[]): void => eventScope.run(() => (run as (...values: unknown[]) => void)(...values));
	switch (kind) {
		case "message":
			return foreignCallback(library, ["u32", "text"], "void", (view, message) => call(Number(view), message ?? ""));
		case "event":
			return foreignCallback(library, ["u32", "i32"], "void", (view, event) => call(Number(view), Number(event)));
		default:
			return foreignCallback(library, ["u32", "text", "text"], "void", (view, result, error) => call(Number(view), result, error));
	}
}
