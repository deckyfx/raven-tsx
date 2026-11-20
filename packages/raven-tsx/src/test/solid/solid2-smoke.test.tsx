/** @jsxImportSource @decky.fx/raven-tsx/solid */
/** Solid 2 on real Raven widgets, headless: what the renderer, the compiler and the flush at the end of an event give. */

import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { createSignal, Errored, flush, For, onCleanup, onSettled, Show } from "solid-js";
import * as r from "../../core/raven";
import { eventStats } from "../../core/events";
import { createElement, insert } from "../../solid/renderer";
import { Button, Checkbox, createAction, createShortcut, createWindow, Label, RavenRoot, VBox, Window, type JSX, type WidgetInstance, type WindowInstance } from "../../solid/index";
// (React's adapter in the same program: each commits what it has pending at the end of an event)
import "../../react/host-config";

const WINDOW = { Title: "Test", Width: 480, Height: 480 } as const;
let window: r.Rid = r.R_INVALID_ID;
let root: RavenRoot | null = null;
const errors: string[] = [];

beforeAll(() => {
	const desc = new r.RInitDesc();
	desc.backend = r.R_BACKEND_NULL;
	desc.headless = 1;
	expect(r.Rinit_ex(desc)).toBe(1);
	r.Rset_animations_enabled(0);
	r.Rerror_set_callback((_code, _severity, detail) => void errors.push(detail ?? ""));
});

afterEach(() => {
	root?.unmount();
	root = null;
	if (window !== r.R_INVALID_ID) {
		r.Rwindow_destroy(window);
		window = r.R_INVALID_ID;
	}
	r.Rdraw_frame();
	// (emptied first: a failure here must not fail every test after)
	const reported = errors.splice(0);
	expect(reported).toEqual([]);
});

afterAll(() => {
	r.Rquit(0);
	r.Rshutdown();
});

/** Renders a tree in a new window: no waiting, the render returns with the tree there. */
function mount(code: () => JSX.Element): void {
	const made = createWindow(WINDOW);
	window = made.window;
	root = made.root;
	root.render(code);
	r.Rdraw_frame();
}

/** Lets the event loop run, with frames between: windows open. */
async function settle(ms = 20): Promise<void> {
	const end = performance.now() + ms;
	let turns = 0;
	do {
		r.Rdraw_frame();
		await new Promise<void>((resolve) => setImmediate(resolve));
		turns++;
	} while (performance.now() < end || turns < 10);
}

const find = (name: string): r.Rid => r.Rwidget_find(window, name);
const text = (name: string): string | null => r.Rlabel_get_text(find(name));

/** Clicks a widget where it is now. */
function click(name: string): void {
	const widget = find(name);
	expect(widget).not.toBe(r.R_INVALID_ID);
	const [x, y, width, height] = r.Rwidget_get_rect(widget);
	expect(width).toBeGreaterThan(0);
	r.Rwindow_inject_mouse_move(window, x + width / 2, y + height / 2);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 1);
	r.Rwindow_inject_mouse_button(window, r.R_MOUSE_LEFT, 0);
}

/** The names of the widgets under a widget, in order. */
function namesUnder(name: string): string[] {
	const parent = find(name);
	expect(parent).not.toBe(r.R_INVALID_ID);
	return Array.from({ length: r.Rwidget_get_child_count(parent) }, (_, index) => r.Rwidget_get_name(r.Rwidget_get_child(parent, index)) ?? "");
}

test("a tree is there when render returns, props and text children in its widgets", () => {
	mount(() => (
		<VBox Name="box" Spacing={8}>
			<Label Name="a" Text="from a prop" />
			<Label Name="b">from a child</Label>
			<Label Name="c">{"count: "}{3}</Label>
		</VBox>
	));
	expect(namesUnder("box")).toEqual(["a", "b", "c"]);
	expect(text("a")).toBe("from a prop");
	expect(text("b")).toBe("from a child");
	expect(text("c")).toBe("count: 3");
});

test("a signal changes a prop of the same widget, once Solid flushes", () => {
	const [label, setLabel] = createSignal("one");
	mount(() => <Label Name="label" Text={label()} />);
	const widget = find("label");
	setLabel("two");
	// (reads lag writes in Solid 2: the widget changes with the flush, or at the microtask)
	flush();
	expect(text("label")).toBe("two");
	expect(find("label")).toBe(widget);
});

test("a write outside a handler reaches the widget at the microtask", async () => {
	const [label, setLabel] = createSignal("one");
	mount(() => <Label Name="label" Text={label()} />);
	setTimeout(() => setLabel("two"), 0);
	await new Promise<void>((resolve) => setTimeout(resolve, 5));
	expect(text("label")).toBe("two");
});

test("what a click handler writes is in the widgets when the click returns", () => {
	function Counter(): JSX.Element {
		const [count, setCount] = createSignal(0);
		return (
			<VBox>
				<Label Name="count">{count()}</Label>
				<Button Name="add" OnClicked={() => setCount(count() + 1)}>add</Button>
			</VBox>
		);
	}
	mount(() => <Counter />);
	click("add");
	expect(text("count")).toBe("1");
	click("add");
	expect(text("count")).toBe("2");
});

test("a controlled Checkbox shows what the signal says when its handler refuses the change", () => {
	const [checked, setChecked] = createSignal(false);
	let locked = false;
	mount(() => (
		<VBox>
			<Checkbox Name="box" Checked={checked()} OnChanged={(next) => setChecked(locked ? checked() : next)}>check</Checkbox>
		</VBox>
	));
	click("box");
	expect(checked()).toBe(true);
	expect(r.Rcheckbox_is_checked(find("box"))).toBe(1);
	// (refused: the widget, which checked itself, is put back to the props)
	locked = true;
	click("box");
	expect(checked()).toBe(true);
	expect(r.Rcheckbox_is_checked(find("box"))).toBe(1);
	locked = false;
	click("box");
	expect(checked()).toBe(false);
	expect(r.Rcheckbox_is_checked(find("box"))).toBe(0);
});

test("a ref on a component gives the widget, placed; a list of refs gives it to each", () => {
	let label: WidgetInstance | undefined;
	const given: r.Rid[] = [];
	mount(() => (
		<VBox>
			<Label ref={label} Name="label" />
			<Button ref={[(button) => void given.push(button.widget), (button) => void given.push(button.widget)]} Name="button">b</Button>
		</VBox>
	));
	expect(label?.widget).toBe(find("label"));
	expect(given).toEqual([find("button"), find("button")]);
});

test("For keeps the widgets of its rows as they move; Show adds and takes away", () => {
	const [rows, setRows] = createSignal(["a", "b", "c"]);
	const [shown, setShown] = createSignal(false);
	mount(() => (
		<VBox Name="list">
			<For each={rows()}>{(row) => <Label Name={`row-${row}`}>{row}</Label>}</For>
			<Show when={shown()}>
				<Label Name="extra">extra</Label>
			</Show>
		</VBox>
	));
	const c = find("row-c");
	expect(namesUnder("list")).toEqual(["row-a", "row-b", "row-c"]);
	setRows(["c", "b", "a"]);
	setShown(true);
	flush();
	expect(namesUnder("list")).toEqual(["row-c", "row-b", "row-a", "extra"]);
	expect(find("row-c")).toBe(c);
	setRows(["b"]);
	setShown(false);
	flush();
	expect(namesUnder("list")).toEqual(["row-b"]);
	expect(r.Rwidget_is_valid(c)).toBe(0);
});

test("unmount runs the cleanups and takes away the widgets and their handlers", () => {
	const log: string[] = [];
	let label: r.Rid = r.R_INVALID_ID;
	function Part(): JSX.Element {
		createAction("smoke.action", () => log.push("action"));
		onSettled(() => {
			log.push(`settled ${r.Rwidget_is_valid(find("part"))}`);
			return () => log.push("settled cleanup");
		});
		onCleanup(() => log.push("cleanup"));
		return <Button Name="part" OnClicked={() => log.push("click")}>part</Button>;
	}
	mount(() => (
		<VBox>
			<Part />
		</VBox>
	));
	// (by onSettled, the widgets are in their window)
	expect(log).toEqual(["settled 1"]);
	label = find("part");
	expect(eventStats().handlers).toBeGreaterThan(0);
	root?.unmount();
	root = null;
	expect(log.slice(1).sort()).toEqual(["cleanup", "settled cleanup"]);
	expect(r.Rwidget_is_valid(label)).toBe(0);
	expect(eventStats().handlers).toBe(0);
	r.Raction_fire("smoke.action", r.R_INVALID_ID);
	expect(log).not.toContain("action");
});

test("a tag written as it is gets its props from the start: createElement's staticProps", () => {
	mount(() => {
		// (what Solid's compiler gives for a tag with props it knows when compiling)
		const label = createElement("Label", { Name: "static", Text: "made with it" });
		const box = createElement("VBox", { Name: "box" });
		insert(box, label);
		return box;
	});
	expect(namesUnder("box")).toEqual(["static"]);
	expect(text("static")).toBe("made with it");
});

test("a ref that throws reaches the Errored around its element", () => {
	mount(() => (
		<VBox>
			<Errored fallback={(error) => <Label Name="caught">{String((error() as Error).message)}</Label>}>
				<Label
					ref={() => {
						throw new Error("from a ref");
					}}
				>
					inside
				</Label>
			</Errored>
		</VBox>
	));
	expect(text("caught")).toBe("from a ref");
});

test("a tree that throws while it renders goes, and the other trees go on reacting", () => {
	const [label, setLabel] = createSignal("one");
	mount(() => <Label Name="label" Text={label()} />);
	function Failing(): JSX.Element {
		throw new Error("from a render");
	}
	const failing = createWindow(WINDOW);
	try {
		expect(() => failing.root.render(() => <VBox Name="failing"><Failing /></VBox>)).toThrow("from a render");
	} finally {
		failing.root.unmount();
		r.Rwindow_destroy(failing.window);
	}
	setLabel("two");
	flush();
	expect(text("label")).toBe("two");
});

test("a shortcut takes the window that a ref sets in a variable, once the tree is there", async () => {
	let owner: WindowInstance | undefined;
	let fired = 0;
	function Keys(): JSX.Element {
		createShortcut(() => owner, "Ctrl+K", () => fired++);
		return <Label>keys</Label>;
	}
	const windows = new RavenRoot();
	try {
		windows.render(() => (
			<Window ref={owner} Title="Keys" Width={200} Height={100}>
				<VBox>
					<Keys />
				</VBox>
			</Window>
		));
		await settle();
		const id = owner?.window ?? r.R_INVALID_ID;
		r.Rwindow_inject_key(id, r.R_KEY_K, 1, r.R_MOD_CTRL);
		r.Rwindow_inject_key(id, r.R_KEY_K, 0, r.R_MOD_CTRL);
		expect(fired).toBe(1);
	} finally {
		windows.unmount();
	}
	expect(eventStats().handlers).toBe(0);
});

test("a text that becomes empty leaves the same widget, with an empty Text", () => {
	const [value, setValue] = createSignal("abc");
	mount(() => (
		<VBox>
			<Label Name="plain">{value()}</Label>
		</VBox>
	));
	const plain = find("plain");
	// (Solid 2 renders no empty text: the widget has no text in it any more)
	setValue("");
	flush();
	expect(text("plain")).toBe("");
	expect(find("plain")).toBe(plain);
	setValue("again");
	flush();
	expect(text("plain")).toBe("again");
	expect(find("plain")).toBe(plain);
});

test("an error says the line of the source, after JSX of more lines compiled and text over several lines", async () => {
	mount(() => (
		<Label
			Name="lines"
			Text={`one
two`}
		/>
	));
	expect(text("lines")).toBe("one\ntwo");
	const error = new Error("here"); // (the line this test looks for)
	const line = (await Bun.file(import.meta.path).text()).split("\n").findIndex((each) => each.includes("// (the line this test looks for)")) + 1;
	expect(error.stack).toContain(`solid2-smoke.test.tsx:${line}:`);
});
