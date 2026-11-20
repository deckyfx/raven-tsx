/**
 * What React has as hooks, for Solid: each lasts as long as the component (or the root) that
 * calls it, and goes with its cleanup. (Solid 2 runs every cleanup of an owner, also after one
 * that threw: none stays bound after its component went)
 */

import { createEffect, createSignal, onCleanup, onSettled } from "solid-js";
import type * as r from "../core/raven";
import type { FrameHandler } from "../core/frame";
import { onAction, onFrame, onShortcut } from "../core/subscriptions";
import type { WindowInstance } from "../core/window-instance";

/**
 * Gives a name to a function, for what fires actions by name: `Rwidget_set_action`, the
 * `Action` of a widget made from XML, `Raction_fire`. It receives the widget that fired the action.
 */
export function createAction(name: string, handler: (sender: r.Rid) => void): void {
	onCleanup(onAction(name, handler));
}

/**
 * A keyboard shortcut of a window: `createShortcut(() => window, "Ctrl+S", save)`, with `window`
 * set by the `ref` of a `<Window>`. It starts once the window is open. With a signal for the ref
 * (`<Window ref={setWindow}>`, `createShortcut(window, ...)`), it follows a window that comes later.
 */
export function createShortcut(window: () => WindowInstance | null | undefined, keys: string, handler: () => void): void {
	// (read once the tree is settled: Solid 2 runs the first read of an effect as it is made, before
	// the `ref` of a window around it has set its variable)
	const [settled, setSettled] = createSignal(false);
	// (what it returns would be a cleanup)
	onSettled(() => {
		setSettled(true);
	});
	createEffect(() => (settled() ? window() : undefined), (owner) =>
		// (each time the window opens: a window taken out of the tree closes, and opens when shown again.
		// What it returns stops it, when the window changes or the owner goes)
		owner ? owner.whenOpen(() => onShortcut(owner.window, keys, handler)) : undefined,
	);
}

/**
 * A function called once per frame, before the layout, with the seconds since the last frame. It
 * also runs when nothing is happening, about 60 times a second: `runApp` wakes that often so that
 * Bun's timers run beside Raven. Any number of them can live side by side, and with `Rset_frame_callback`.
 */
export function createFrame(handler: FrameHandler): void {
	onCleanup(onFrame(handler));
}
