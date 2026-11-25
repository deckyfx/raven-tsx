/**
 * A test of an interface (raven_testing.h): the sign-in form is driven by the names of its widgets,
 * as a user would, then what it shows is checked, as text and as a picture compared with a golden
 * image. The port of `examples/ui_test` of Raven, whose golden it uses: the same window, made by
 * React here and by XML there, gives the same pixels.
 *
 *     bun test                          runs the test
 *     RAVEN_UPDATE_GOLDENS=1 bun test   writes the golden images again
 *
 * The goldens are in goldens/, one per OS and backend (login.macos-metal.png): what the GPU draws
 * differs a little between backends. Without a GPU, or without a golden for this OS and backend,
 * the picture is not compared.
 */

import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { createWindow, raven as r, type RavenRoot } from "@decky.fx/raven-tsx/react";
import { Login } from "./Login";

const GOLDENS = `${import.meta.dir}/../goldens`;
const errors: string[] = [];
let window: r.Rid = r.R_INVALID_ID;
let root: RavenRoot | null = null;

/** Lets React commit and Raven draw, until nothing moves. */
async function settle(): Promise<void> {
	for (let turn = 0; turn < 10; turn++) {
		r.Rtest_settle(0.2);
		await new Promise<void>((resolve) => setImmediate(resolve));
	}
}

beforeAll(async () => {
	// (no window on the screen: the frames are rendered offscreen and read back)
	const desc = new r.RInitDesc();
	desc.backend = process.env["RAVEN_BACKEND"] === "null" ? r.R_BACKEND_NULL : r.R_BACKEND_DEFAULT;
	desc.headless = 1;
	expect(r.Rinit_ex(desc)).toBe(1);
	// (an error of the library from here on fails the test)
	r.Rerror_set_callback((_code, _severity, detail) => void errors.push(detail ?? ""));
	// (the same frames on every run: a fixed look, a fixed clock, carets that do not blink)
	r.Rlook_set(r.R_LOOK_RAVEN_DARK);
	r.Rtest_set_deterministic(1);
	const made = createWindow({ Title: "Sign in", Width: 340, Height: 250 });
	window = made.window;
	root = made.root;
	root.render(<Login />);
	await settle();
});

afterAll(() => {
	root?.unmount();
	r.Rwindow_destroy(window);
	r.Rshutdown();
});

const find = (path: string): r.Rid => r.Rtest_find(window, path);

test("nothing typed: the form says so", async () => {
	expect(r.Rtest_click(find("form/submit"))).toBe(1);
	await settle();
	expect(r.Rtest_get_text(find("status"))).toBe("Type a user name");
});

test("a user types a name and a password, then signs in, and the window looks as it should", async () => {
	expect(r.Rtest_type_text(find("user"), "ada")).toBe(1);
	expect(r.Rtest_type_text(find("password"), "secret\n")).toBe(1);
	await settle();
	expect(r.Rtest_click(find("form/submit"))).toBe(1);
	expect(r.Rtest_hover_at(window, 0, 0)).toBe(1);
	await settle();
	expect(r.Rtest_get_text(find("user"))).toBe("ada");
	expect(r.Rtest_get_text(find("status"))).toBe("Welcome, ada");
	expect(errors).toEqual([]);
	// (the picture in the same test: a test chosen by name alone would compare, or write, an empty form)
	expectGolden();
});

/** The window, compared with its golden: "ada" signed in. */
function expectGolden(): void {
	const golden = `${GOLDENS}/login.${r.Rtest_get_platform_tag()}.png`;
	if (!existsSync(golden) && !process.env["RAVEN_UPDATE_GOLDENS"]) {
		console.log(`no golden for ${r.Rtest_get_platform_tag()}: the picture is not compared`);
		return;
	}
	const options = new r.RGoldenOptions();
	options.channel_tolerance = 8;
	options.max_diff_ratio = 0.002;
	options.per_platform = 1;
	const result = new r.RGoldenResult();
	const same = r.Rtest_expect_golden(window, `${GOLDENS}/login.png`, options, result);
	console.log(result.message);
	expect(same).toBe(1);
}
