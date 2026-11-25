/**
 * The services of the device, as a desktop without a window system answers them: what does not
 * exist here says so, at a later frame, and the pickers are Raven's own file dialog, which a frame
 * function plays the user of. No dialog of the system is shown, and nothing leaves the process.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as r from "../../core/raven";
import {
	clipboardHasText, exportFile, getPermission, haptic, isCameraAvailable, isHapticSupported, openFiles, openSettings, pickPhotos, requestPermission,
	saveFile, selectFolder, share, takePhoto, watchPermission, type DeviceAnswer,
} from "../../core/device";
import { forgetDeviceRequests, pendingDeviceRequests } from "../../core/device";
import { RavenError } from "../../core/errors";

let window: r.Rid = r.R_INVALID_ID;
const folder = mkdtempSync(join(tmpdir(), "raven-tsx-device-"));

beforeAll(() => {
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_NULL;
	desc.headless = 1;
	expect(r.Rinit_ex(desc)).toBe(1);
	r.Rset_animations_enabled(0);
	window = r.Rwindow_create("device", 640, 480, 0);
	writeFileSync(join(folder, "notes.txt"), "hello");
	writeFileSync(join(folder, "photo.png"), "not really a picture");
});

afterAll(() => {
	if (r.Ris_initialized()) {
		r.Rshutdown();
	}
	rmSync(folder, { recursive: true, force: true });
});

/** Draws frames until the promise is settled, and gives what it gave. */
async function answered<T>(promise: Promise<T>, frames = 200): Promise<T> {
	let done = false;
	const settled = promise.finally(() => {
		done = true;
	});
	for (let frame = 0; frame < frames && !done; frame++) {
		r.Rdraw_frame();
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
	expect(done).toBe(true);
	return settled;
}

test("what a desktop does not have: no camera, no haptics, no Settings, and no permission to ask for", async () => {
	expect(isCameraAvailable()).toBe(false);
	expect(isHapticSupported()).toBe(false);
	expect(haptic("success")).toBe(false);
	expect(openSettings()).toBe(false);
	expect(getPermission("camera")).toBe("unsupported");
	expect(getPermission("notifications")).toBeOneOf(["unsupported", "granted"]);
	expect(() => getPermission("teleport" as never)).toThrow('"teleport" is not a permission');
	expect(() => haptic("thud" as never)).toThrow("is not a haptic");
});

test("each request is answered once, at a later frame, never inside the call", async () => {
	let early = false;
	const asked = requestPermission("camera").then((status) => {
		early = status !== undefined;
		return status;
	});
	await Promise.resolve();
	expect(early).toBe(false);
	expect(pendingDeviceRequests()).toBe(1);
	expect(await answered(asked)).toBe("unsupported");
	expect(pendingDeviceRequests()).toBe(0);
});

test("the camera and the share sheet are unsupported on a desktop, with no files", async () => {
	const [photo, shared, location] = await answered(Promise.all([takePhoto(), share({ text: "https://example.com" }), requestPermission("location")]));
	expect(photo).toEqual({ result: "unsupported", files: [] });
	expect(shared).toEqual({ result: "unsupported", files: [] });
	expect(location).toBe("unsupported");
	expect(() => share({})).toThrow("needs a text or a path");
});

/**
 * Plays the user of Raven's file dialog: once it shows (its file browser has the keyboard),
 * `choose` is called with it, from a timer, which runs in the frames of the dialog, which waits
 * inside a frame of the test. (a timer and not a frame function: the dialog waits for events
 * before each of its frames, and only a timer ends that wait here)
 */
function playDialog(choose: (browser: r.Rid) => void): () => void {
	let done = false;
	const timer = r.Rtimer_create(0.01, 1, () => {
		const browser = r.Rwindow_get_focused_widget(window);
		if (!done && browser !== r.R_INVALID_ID && r.Rwidget_get_type(browser) === r.R_WIDGET_FILE_BROWSER) {
			done = true;
			choose(browser);
		}
	});
	return () => r.Rtimer_destroy(timer);
}

const enter = (): void => {
	r.Rwindow_inject_key(window, r.R_KEY_ENTER, 1, 0);
	r.Rwindow_inject_key(window, r.R_KEY_ENTER, 0, 0);
};

/** Clicks the button of the dialog that accepts ("Save", "Select folder"): the one that does not cancel. */
function accept(browser: r.Rid): void {
	for (let index = r.Rwidget_get_child_count(browser) - 1; index >= 0; index--) {
		const child = r.Rwidget_get_child(browser, index);
		if (r.Rwidget_get_type(child) === r.R_WIDGET_BUTTON && r.Rtest_get_text(child) !== "Cancel") {
			expect(r.Rtest_click(child)).toBe(1);
			return;
		}
	}
	throw new Error("no button that accepts in the dialog");
}

test("openFiles is answered with the file chosen in the dialog, its name, and its size", async () => {
	const stop = playDialog((browser) => {
		r.Rfile_browser_select(browser, "notes.txt");
		enter();
	});
	const answer = await answered(openFiles({ window, directory: folder, title: "A note", filters: [{ name: "Text", patterns: ["*.txt", "*.md"] }] }));
	stop();
	expect(answer.result).toBe("done");
	expect(answer.files).toHaveLength(1);
	const [file] = answer.files;
	expect(file?.path).toBe(join(folder, "notes.txt"));
	expect(file?.name).toBe("notes.txt");
	expect(file?.size).toBe(5);
	expect(pendingDeviceRequests()).toBe(0);
});

test("a dialog closed without a choice is cancelled, with no files", async () => {
	const stop = playDialog(() => {
		r.Rwindow_inject_key(window, r.R_KEY_ESCAPE, 1, 0);
		r.Rwindow_inject_key(window, r.R_KEY_ESCAPE, 0, 0);
	});
	const answer: DeviceAnswer = await answered(pickPhotos(2));
	stop();
	expect(answer).toEqual({ result: "cancelled", files: [] });
});

test("saveFile writes the bytes where the user chose, and exportFile copies a file there", async () => {
	let stop = playDialog((browser) => {
		r.Rfile_browser_set_file_name(browser, "saved.txt");
		accept(browser);
	});
	const saved = await answered(saveFile("written by raven-tsx", { window, directory: folder, fileName: "proposed.txt" }));
	stop();
	expect(saved.result).toBe("done");
	expect(saved.files[0]?.path).toBe(join(folder, "saved.txt"));
	expect(readFileSync(join(folder, "saved.txt"), "utf8")).toBe("written by raven-tsx");

	stop = playDialog((browser) => {
		r.Rfile_browser_set_file_name(browser, "copy.txt");
		accept(browser);
	});
	const exported = await answered(exportFile(join(folder, "notes.txt"), { window, directory: folder }));
	stop();
	expect(exported.result).toBe("done");
	expect(readFileSync(join(folder, "copy.txt"), "utf8")).toBe("hello");
});

test("selectFolder gives the folder chosen", async () => {
	const stop = playDialog(accept);
	const answer = await answered(selectFolder({ window, directory: folder }));
	stop();
	expect(answer.result).toBe("done");
	expect(answer.files[0]?.path).toBeString();
});

test("watchPermission says the status at once, and stops with what it returns", () => {
	const seen: string[] = [];
	const stop = watchPermission("microphone", (status) => seen.push(status));
	expect(seen).toEqual(["unsupported"]);
	r.Rdraw_frame();
	stop();
	expect(seen).toEqual(["unsupported"]);
});

test("the clipboard says it holds a text, without reading it", () => {
	r.Rclipboard_set_text("copied");
	expect(clipboardHasText()).toBe(true);
});

test("once Raven stopped, a request says so rather than wait for ever, and what waited is forgotten", () => {
	const waiting = requestPermission("photos");
	void waiting;
	expect(pendingDeviceRequests()).toBe(1);
	r.Rwindow_destroy(window);
	r.Rshutdown();
	// (as runApp does after Rshutdown: Raven dropped it unanswered)
	forgetDeviceRequests();
	expect(pendingDeviceRequests()).toBe(0);
	expect(() => requestPermission("camera")).toThrow(RavenError);
	expect(() => openFiles()).toThrow("needs Raven to be running");
	expect(pendingDeviceRequests()).toBe(0);
});
