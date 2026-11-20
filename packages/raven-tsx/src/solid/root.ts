import { createComponent, createRoot, flush, resetErrorHalt } from "solid-js";
import * as r from "../core/raven";
import { RavenError } from "../core/errors";
import { nextFrame } from "../core/events";
import { resolveProps, type RavenProps } from "../core/props";
import type { WindowOptions } from "../core/props.generated";
import { makeWindow } from "../core/window-instance";
import { Window } from "./components.generated";
import type { JSX } from "./jsx-runtime";
import { SolidNode } from "./node";
import { insert } from "./renderer";

/**
 * A tree of Solid, as `render` of @solidjs/web. Given a widget, it renders into it.
 * Without one, it renders `<Window>` elements, each its own window.
 */
export class RavenRoot {
	private readonly node: SolidNode;
	private dispose: (() => void) | null = null;

	constructor(parent: r.Rid = r.R_INVALID_ID) {
		this.node = SolidNode.container(parent);
	}

	/**
	 * Renders a tree, in place of the one it had, and returns once it is there. If the tree throws,
	 * what it made goes (its cleanups run, its widgets go) and the error goes on. (as Solid's
	 * `render`, but the root is kept before the code runs: `render` gives it back only once the code
	 * has returned)
	 *
	 * What other trees have pending is applied first: an error there is theirs, and goes to the
	 * caller before this tree changes, which keeps the one it had.
	 */
	render(code: () => JSX.Element): void {
		// (Solid's flush is for all its trees: the one below would take their errors for this tree's)
		flush();
		this.unmount();
		// (a cleanup may have rendered a tree again: this render replaces that one too)
		while (this.dispose !== null) {
			this.unmount();
		}
		let own: (() => void) | null = null;
		try {
			createRoot((dispose) => {
				own = dispose;
				this.dispose = dispose;
				const view = code();
				// (a render in the code replaced this one, its root with it: what it made went then)
				if (this.dispose === dispose) {
					insert(this.node, view);
				}
			});
			// (Solid applies what it computed at the next microtask: the tree is there when this returns,
			// as the effects that come with it have run)
			flush();
		} catch (error) {
			try {
				// (a render in the code that failed replaced it: that tree stays, this one went then)
				if (this.dispose === own) {
					this.unmount();
				}
			} catch (cleanup) {
				console.error("raven-tsx: cleaning up a tree that failed:", cleanup);
			}
			// (an error no boundary takes stops all of Solid, for what it left half made: that tree is
			// gone now, and the others go on, as the error goes to the caller of render)
			resetErrorHalt();
			throw error;
		}
	}

	/** Removes the tree: its cleanups run (all of them, also after one that threw), and its widgets and windows go. */
	unmount(): void {
		const dispose = this.dispose;
		this.dispose = null;
		try {
			dispose?.();
		} finally {
			// (the widgets and windows go, also when a cleanup threw. Unless a cleanup rendered a tree
			// again: that one stays, and it took this one away first)
			if (this.dispose === null) {
				this.node.clear();
			}
		}
	}
}

/** Makes a window with a place for a tree, and returns the handle of the window with its root. */
export function createWindow(options: WindowOptions = {}): { window: r.Rid; root: RavenRoot } {
	const { window, content } = makeWindow(resolveProps(options as RavenProps).attributes);
	return { window, root: new RavenRoot(content) };
}

/** How `runApp` starts Raven. */
export interface RunOptions {
	/** The name of the application: `RInitDesc::app_name`, which system notifications show. */
	readonly appName?: string | undefined;
	/** Runs after Raven started and before the first render: for a look, a theme, a registered tag. */
	readonly setup?: (() => void) | undefined;
	/** Raven's allocator: functions of C only, as it allocates on several threads. See `Rset_allocator`. */
	readonly allocator?: Parameters<typeof r.Rset_allocator>[0] | undefined;
	/**
	 * What draws: Raven's default by default, Metal on macOS and Vulkan elsewhere.
	 * `R_BACKEND_VULKAN` for what Metal cannot run: a Vulkan `Viewport`, effects given as SPIR-V
	 * (`Rshader_create`). On macOS it then needs MoltenVK.
	 */
	readonly backend?: r.RBackend | undefined;
}

/**
 * Starts Raven, shows a tree and runs until the last window closes, the event loop of Bun
 * running beside it. Then the tree is cleaned up and Raven stops, also when the run ends with an
 * error, so that it can start again.
 *
 * With options, the tree goes in one window made from them. Without, the tree says what windows
 * there are, with `<Window>` elements.
 *
 *     await runApp(() => <App />, { Title: "Hello", Width: 480, Height: 240 });
 */
export async function runApp(code: () => JSX.Element, options?: WindowOptions, start?: RunOptions): Promise<void> {
	if (start?.allocator) {
		r.Rset_allocator(start.allocator);
	}
	const desc = new r.RInitDesc();
	desc.backend = start?.backend ?? r.R_BACKEND_DEFAULT;
	desc.app_name = start?.appName ?? null;
	if (!r.Rinit_ex(desc)) {
		RavenError.fromLibrary("Raven cannot start");
	}
	let root: RavenRoot | null = null;
	try {
		start?.setup?.();
		root = new RavenRoot();
		root.render(options ? () => createComponent(Window, { ...options, get children() { return code(); } }) : code);
		// (Rwait_frame ends once the last window closed: until there was one, it goes on)
		await r.runLoop();
	} finally {
		try {
			root?.unmount();
		} finally {
			r.Rshutdown();
			// (the tasks Raven dropped as it stopped: what waited for them would wait for ever)
			nextFrame.clear();
		}
	}
}
