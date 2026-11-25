import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { getPermission, requestPermission, watchPermission, type Permission, type PermissionStatus } from "../core/device";
import type * as r from "../core/raven";
import type { FrameHandler } from "../core/frame";
import { onAction, onFrame, onShortcut } from "../core/subscriptions";
import type { WindowInstance } from "../core/window-instance";

/**
 * The function of the last commit, for a native callback to call. Not of the last render: React
 * can throw a render away, and then its function would see state that never was.
 */
function useLatest<T>(value: T): RefObject<T> {
	const latest = useRef(value);
	useLayoutEffect(() => {
		latest.current = value;
	});
	return latest;
}

/**
 * Gives a name to a function, for what fires actions by name: `Rwidget_set_action`, the
 * `Action` of a widget made from XML, `Raction_fire`. The function can change at each render.
 * It receives the widget that fired the action.
 */
export function useAction(name: string, handler: (sender: r.Rid) => void): void {
	const latest = useLatest(handler);
	useEffect(() => onAction(name, (sender) => latest.current(sender)), [name]);
}

/** A keyboard shortcut of a window: `useShortcut(window, "Ctrl+S", save)`, with `window` the ref of a `<Window>`. */
export function useShortcut(window: RefObject<WindowInstance | null>, keys: string, handler: () => void): void {
	const latest = useLatest(handler);
	useEffect(() => {
		const owner = window.current;
		if (!owner) {
			return;
		}
		return onShortcut(owner.window, keys, () => latest.current());
	}, [window, keys]);
}

/**
 * A function called once per frame, before the layout, with the seconds since the last frame:
 * what it changes is committed in time for that frame. It also runs when nothing is happening,
 * about 60 times a second: `runApp` wakes that often so that Bun's timers run beside Raven, which
 * `Rwait_frame(-1)` would stop. Any number of them can live side by side, and with
 * `Rset_frame_callback`. The function can change at each render.
 */
export function useFrame(handler: FrameHandler): void {
	const latest = useLatest(handler);
	useEffect(() => onFrame((delta) => latest.current(delta)), []);
}

/**
 * The status of a permission, as state, and what asks for it: `const [camera, askCamera] = usePermission("camera")`.
 * It follows what the user answers, and what they change in the Settings of the system while the
 * application is away. Asking gives the answer too, and needs Raven running (an effect, a handler).
 */
export function usePermission(name: Permission): readonly [PermissionStatus, () => Promise<PermissionStatus>] {
	const [status, setStatus] = useState<PermissionStatus>(() => getPermission(name));
	// (each watch of a name is a subscription: an answer asked during an earlier one, even of the same
	// name, is still given to whoever asked, but does not set the status; the watch reads it anyway)
	const subscription = useRef(0);
	useEffect(() => {
		subscription.current++;
		return watchPermission(name, setStatus);
	}, [name]);
	const ask = useCallback(async (): Promise<PermissionStatus> => {
		const asked = subscription.current;
		const answer = await requestPermission(name);
		if (subscription.current === asked) {
			setStatus(answer);
		}
		return answer;
	}, [name]);
	return [status, ask] as const;
}
