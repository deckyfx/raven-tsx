/**
 * The services of the device (`raven_device.h`) as promises: permissions, the pickers and the
 * camera of the system, sharing, haptics, and opening an address. On a phone they show a screen of
 * the system while the application runs on; on desktops the pickers are Raven's file dialogs, and
 * the camera and the share sheet are not there (`"unsupported"`).
 *
 *     const { result, files } = await openFiles({ filters: [{ name: "Images", patterns: "*.png;*.jpg" }] });
 *
 * Each request is answered once, on the UI thread, at a later frame: never inside the call. One
 * native callback serves all of them, told apart by their user data, so nothing is made per
 * request and nothing can be collected before C calls it. A request still open when Raven stops
 * is never answered, as in C: its promise stays pending.
 */

import type { Pointer } from "bun:ffi";
import { addressOfStruct, nativeCallback } from "#backend";
import type { NativeCallback, NativeValue } from "./backend/types";
import { RavenError } from "./errors";
import * as r from "./raven";
import { onFrame } from "./subscriptions";
import type { WidgetInstance } from "./widget-instance";
import type { WindowInstance } from "./window-instance";

/** What the application may be allowed to use. */
export type Permission = "camera" | "notifications" | "photos" | "microphone" | "location";

/**
 * What the user answered, or would be asked: `"unsupported"` where there is nothing to ask for
 * (a desktop, but for notifications), `"blocked"` when only the Settings of the system can change it.
 */
export type PermissionStatus = "unsupported" | "not-asked" | "granted" | "limited" | "denied" | "blocked";

/** How a request of a picker, the camera, a save or a share sheet ended. */
export type DeviceResult = "done" | "cancelled" | "denied" | "unsupported" | "busy" | "failed";

/** A short vibration that answers a touch. */
export type Haptic = "light" | "medium" | "heavy" | "selection" | "success" | "warning" | "error";

/** A file a service gave, copied out of what C holds during its callback. */
export interface PickedFile {
	/** A path Raven and the file system can read; on iOS and Android a copy in the cache. Null for a file saved on a phone, which went where the user chose. */
	readonly path: string | null;
	/** The name the user saw ("IMG_0042.JPG"). */
	readonly name: string;
	/** The MIME type when the system tells it, or null. */
	readonly mimeType: string | null;
	/** Bytes. */
	readonly size: number;
	/** Pixels of a photo when known, else 0. */
	readonly width: number;
	readonly height: number;
}

/** The answer to a request: how it ended, and the files it gave (none unless it is `"done"`). */
export interface DeviceAnswer {
	readonly result: DeviceResult;
	readonly files: readonly PickedFile[];
}

/** A kind of file that can be chosen: patterns of extensions, `"*.png;*.jpg"`, or a list of them. */
export interface FileFilter {
	readonly name: string;
	readonly patterns: string | readonly string[];
}

/** What a picker shows. Every field may be left out. */
export interface FileOptions {
	/** The window it belongs to: its handle, or the ref of a `<Window>`. None: the first one. */
	readonly window?: r.Rid | WindowInstance | null | undefined;
	readonly title?: string | undefined;
	/** The folder shown first (desktops). */
	readonly directory?: string | undefined;
	/** The name proposed (a save). */
	readonly fileName?: string | undefined;
	readonly filters?: readonly FileFilter[] | undefined;
	/** Added to a name typed without one (a save on a desktop): `"txt"`. */
	readonly defaultExtension?: string | undefined;
	/** Several files may be chosen (`openFiles`). */
	readonly multiple?: boolean | undefined;
}

/** What the share sheet offers: a text or a link, and / or a file. */
export interface ShareOptions {
	readonly text?: string | undefined;
	/** A file to send, a path Raven can read. */
	readonly path?: string | undefined;
	/** Its MIME type: guessed from its extension when left out. */
	readonly mimeType?: string | undefined;
	/** The title of the sheet, where the system shows one. */
	readonly title?: string | undefined;
	/** What the sheet points at on a tablet: the widget that shares. None: the middle of the window. */
	readonly anchor?: r.Rid | WidgetInstance | null | undefined;
}

const PERMISSIONS: Readonly<Record<Permission, r.RPermission>> = {
	camera: r.R_PERMISSION_CAMERA,
	notifications: r.R_PERMISSION_NOTIFICATIONS,
	photos: r.R_PERMISSION_PHOTOS,
	microphone: r.R_PERMISSION_MICROPHONE,
	location: r.R_PERMISSION_LOCATION,
};

const STATUSES: Readonly<Record<number, PermissionStatus>> = {
	[r.R_PERMISSION_UNSUPPORTED]: "unsupported",
	[r.R_PERMISSION_NOT_ASKED]: "not-asked",
	[r.R_PERMISSION_GRANTED]: "granted",
	[r.R_PERMISSION_LIMITED]: "limited",
	[r.R_PERMISSION_DENIED]: "denied",
	[r.R_PERMISSION_BLOCKED]: "blocked",
};

const RESULTS: Readonly<Record<number, DeviceResult>> = {
	[r.R_DEVICE_DONE]: "done",
	[r.R_DEVICE_CANCELLED]: "cancelled",
	[r.R_DEVICE_DENIED]: "denied",
	[r.R_DEVICE_UNSUPPORTED]: "unsupported",
	[r.R_DEVICE_BUSY]: "busy",
	[r.R_DEVICE_FAILED]: "failed",
};

const HAPTICS: Readonly<Record<Haptic, r.RHaptic>> = {
	light: r.R_HAPTIC_LIGHT,
	medium: r.R_HAPTIC_MEDIUM,
	heavy: r.R_HAPTIC_HEAVY,
	selection: r.R_HAPTIC_SELECTION,
	success: r.R_HAPTIC_SUCCESS,
	warning: r.R_HAPTIC_WARNING,
	error: r.R_HAPTIC_ERROR,
};

/** The value of C for a permission, or a RavenError for a name that is none. */
function permissionOf(name: Permission): r.RPermission {
	return PERMISSIONS[name] ?? RavenError.throw(`raven-tsx: "${String(name)}" is not a permission: ${Object.keys(PERMISSIONS).join(", ")}`);
}

const statusOf = (value: NativeValue): PermissionStatus => STATUSES[Number(value)] ?? "unsupported";

/** Throws unless Raven runs: before it, or after it stopped, a request would never be answered. */
function requireRaven(what: string): void {
	if (!r.Ris_initialized()) {
		RavenError.throw(`raven-tsx: ${what} needs Raven to be running: call it once runApp has started`);
	}
}

/**
 * The files C gives during its callback, copied: `count` structures one after the other at `files`,
 * an address on Bun, and on Node.js the first of them, whose address the backend knows (where views
 * of the library's memory are copies, the structure holds the first file only).
 */
function copyFiles(files: NativeValue, count: number): PickedFile[] {
	const copied: PickedFile[] = [];
	const address = typeof files === "number" ? files : files instanceof r.RPickedFile ? addressOfStruct(files) : 0;
	if (!address) {
		return copied;
	}
	for (let index = 0; index < count; index++) {
		const file = r.RPickedFile.from((address + index * r.RPickedFile.SIZE) as Pointer);
		if (file) {
			copied.push({
				path: file.path,
				name: file.name ?? "",
				mimeType: file.mime_type,
				size: Number(file.size),
				width: file.width,
				height: file.height,
			});
		}
	}
	return copied;
}

/**
 * The requests waiting for their answer, by the number given to C as their user data (from 1: a
 * null user data is none), and the one native callback of each kind of answer.
 */
class Requests<T> {
	private readonly waiting = new Map<number, (answer: T) => void>();
	private next = 0;
	private callback: NativeCallback | null = null;

	constructor(private readonly make: (answer: (id: number, value: T) => void) => NativeCallback) {}

	/** Starts a request: `start` is given the callback and the user data to hand to C. */
	ask(start: (callback: NativeCallback, userData: Pointer) => void): Promise<T> {
		this.callback ??= this.make((id, value) => this.answer(id, value));
		const id = (this.next = (this.next % 0x7fffffff) + 1);
		const { promise, resolve } = Promise.withResolvers<T>();
		this.waiting.set(id, resolve);
		try {
			start(this.callback, id as Pointer);
		} catch (error) {
			this.waiting.delete(id);
			throw error;
		}
		return promise;
	}

	/**
	 * Gives a request its answer, once. What awaits it runs at the next microtask, out of the
	 * frame of C, as after a timer: what it changes is committed as any change outside an event.
	 */
	private answer(id: number, value: T): void {
		const resolve = this.waiting.get(id);
		if (resolve) {
			this.waiting.delete(id);
			resolve(value);
		}
	}

	/** Forgets what waits: Raven stopped, and will never answer it. */
	clear(): void {
		this.waiting.clear();
	}

	/** How many requests wait, for the tests. */
	get size(): number {
		return this.waiting.size;
	}
}

const permissionRequests = new Requests<PermissionStatus>((answer) =>
	nativeCallback(["i32", "i32"], "void", (_permission, status, userData) => answer(Number(userData), statusOf(status ?? null)), true));

const deviceRequests = new Requests<DeviceAnswer>((answer) =>
	nativeCallback(["i32", "pointer", "i32"], "void", (result, files, count, userData) => {
		answer(Number(userData), { result: RESULTS[Number(result)] ?? "failed", files: copyFiles(files ?? null, Number(count)) });
	}, true));

/** Forgets the requests that wait, which Raven will not answer once it stopped. The adapters call it after `Rshutdown`. */
export function forgetDeviceRequests(): void {
	permissionRequests.clear();
	deviceRequests.clear();
}

/** How many requests wait for their answer, for the tests. */
export const pendingDeviceRequests = (): number => permissionRequests.size + deviceRequests.size;

/** What the user answered for a permission, without asking. Cheap: the system remembers it. */
export function getPermission(name: Permission): PermissionStatus {
	return statusOf(r.Rpermission_get_status(permissionOf(name)));
}

/**
 * Asks the user for a permission, with the question of the system, when it was not asked yet or
 * was refused; otherwise answers with what is known. Several requests share one question.
 */
export function requestPermission(name: Permission): Promise<PermissionStatus> {
	const permission = permissionOf(name);
	requireRaven("requestPermission");
	return permissionRequests.ask((callback, userData) => r.Rpermission_request(permission, callback, userData));
}

/** Opens the page of the application in the Settings of the system. False where there is none (desktops). */
export function openSettings(): boolean {
	return r.Rpermission_open_settings() !== 0;
}

/** The window of a request, as C takes it. */
function windowOf(window: FileOptions["window"]): r.Rid {
	if (window === null || window === undefined) {
		return r.R_INVALID_ID;
	}
	return typeof window === "number" ? window : window.window;
}

/** The description of a picker, as C takes it: read during the call only. */
function dialogOf(options: FileOptions): r.RFileDialogDesc {
	const desc = new r.RFileDialogDesc();
	desc.parent = windowOf(options.window);
	desc.title = options.title ?? null;
	desc.directory = options.directory ?? null;
	desc.file_name = options.fileName ?? null;
	desc.default_extension = options.defaultExtension ?? null;
	desc.flags = options.multiple ? r.R_FILE_DIALOG_MULTIPLE : 0;
	const filters = (options.filters ?? []).map((filter) => {
		const made = new r.RFileFilter();
		made.name = filter.name;
		made.patterns = typeof filter.patterns === "string" ? filter.patterns : filter.patterns.join(";");
		return made;
	});
	if (filters.length > 0) {
		desc.filters = filters;
		desc.filter_count = filters.length;
	}
	return desc;
}

/** Starts a request of a picker, the camera or a share sheet. */
function deviceRequest(what: string, start: (callback: NativeCallback, userData: Pointer) => void): Promise<DeviceAnswer> {
	requireRaven(what);
	return deviceRequests.ask(start);
}

/** Asks for a file to read, or several with `multiple`. */
export function openFiles(options: FileOptions = {}): Promise<DeviceAnswer> {
	const desc = dialogOf(options);
	return deviceRequest("openFiles", (callback, userData) => r.Rfile_open_async(desc, callback, userData));
}

/** Saves bytes, or a text as UTF-8, as a file where the user chooses, proposed under `fileName`. */
export function saveFile(data: string | Uint8Array, options: FileOptions = {}): Promise<DeviceAnswer> {
	const desc = dialogOf(options);
	const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
	// (copied by C at once)
	return deviceRequest("saveFile", (callback, userData) => r.Rfile_save_async(desc, bytes.byteLength > 0 ? bytes : null, callback, userData));
}

/** Copies a file that exists (a path Raven can read) where the user chooses. */
export function exportFile(path: string, options: FileOptions = {}): Promise<DeviceAnswer> {
	const desc = dialogOf(options);
	return deviceRequest("exportFile", (callback, userData) => r.Rfile_export_async(desc, path, callback, userData));
}

/** Asks for a folder: desktops only for now (`"unsupported"` on iOS and Android). */
export function selectFolder(options: FileOptions = {}): Promise<DeviceAnswer> {
	const desc = dialogOf(options);
	return deviceRequest("selectFolder", (callback, userData) => r.Rfile_select_folder_async(desc, callback, userData));
}

/** Whether `takePhoto` can show a camera: none on desktops, nor in the iOS Simulator. */
export function isCameraAvailable(): boolean {
	return r.Rcamera_is_available() !== 0;
}

/** Takes one photo with the camera of the system, asking for the permission first when needed (`"denied"`). A JPEG file, upright. */
export function takePhoto(): Promise<DeviceAnswer> {
	return deviceRequest("takePhoto", (callback, userData) => r.Rcamera_take_photo(callback, userData));
}

/** Picks photos with the picker of the system, which needs no permission (desktops: a file dialog). `max` 0: no limit. */
export function pickPhotos(max = 0): Promise<DeviceAnswer> {
	return deviceRequest("pickPhotos", (callback, userData) => r.Rphoto_pick(max, callback, userData));
}

/** Shows the share sheet of the system: `"unsupported"` on desktops. */
export function share(options: ShareOptions): Promise<DeviceAnswer> {
	if (options.text === undefined && options.path === undefined) {
		RavenError.throw("raven-tsx: share needs a text or a path");
	}
	const desc = new r.RShareDesc();
	desc.text = options.text ?? null;
	desc.path = options.path ?? null;
	desc.mime_type = options.mimeType ?? null;
	desc.title = options.title ?? null;
	const anchor = options.anchor;
	desc.anchor = anchor === null || anchor === undefined ? r.R_INVALID_ID : typeof anchor === "number" ? anchor : anchor.widget;
	return deviceRequest("share", (callback, userData) => r.Rshare_show(desc, callback, userData));
}

/** Whether the device plays haptics: a phone, never a desktop. */
export function isHapticSupported(): boolean {
	return r.Rhaptic_is_supported() !== 0;
}

/** Plays a short vibration, as the controls of the system do. Whether it was handed to the system. */
export function haptic(kind: Haptic): boolean {
	const value = HAPTICS[kind] ?? RavenError.throw(`raven-tsx: "${String(kind)}" is not a haptic: ${Object.keys(HAPTICS).join(", ")}`);
	return r.Rhaptic_play(value) !== 0;
}

/** Opens an address with what the system has for it: a web page in the browser, a `mailto:`. Whether it could. */
export function openUrl(url: string): boolean {
	return r.Ropen_url(url) !== 0;
}

/** Whether the clipboard holds a text, without reading it (which some systems tell the user of). */
export function clipboardHasText(): boolean {
	return r.Rclipboard_has_text() !== 0;
}

/** How often a watched permission is read again, in seconds: it is cheap, and the user changes it elsewhere. */
const PERMISSION_POLL = 0.5;

/**
 * Calls `handler` with the status of a permission, at once and each time it changes: when the user
 * answered, or changed it in the Settings of the system while the application was away. Read again
 * twice a second, at the frames. Returns what stops it.
 */
export function watchPermission(name: Permission, handler: (status: PermissionStatus) => void): () => void {
	let status = getPermission(name);
	let waited = 0;
	handler(status);
	return onFrame((delta) => {
		waited += delta;
		if (waited < PERMISSION_POLL) {
			return;
		}
		waited = 0;
		const now = getPermission(name);
		if (now !== status) {
			status = now;
			handler(now);
		}
	});
}
