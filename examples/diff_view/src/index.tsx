/**
 * Two versions of a small C file (samples/v1.0 and samples/v1.1) compared by a `DiffView`: side by
 * side or in one column, the spaces that count or not, the context around the changes, the
 * buttons that go from change to change, a note on a line, and the line clicked. The port of
 * `examples/diff_view` of Raven.
 *
 * The mode, the spaces and the context are props, from state. Going to a change is an action, not
 * state: the buttons do it through a ref, as F7 and Shift+F7 do in the widget. `OnLineClicked`
 * says the line clicked, and on which side.
 *
 * For the automated runs: RAVEN_DIFF_MODE=unified shows one column, RAVEN_DIFF_THEME=light the
 * light look, RAVEN_DIFF_CHANGE=n goes to a change.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Checkbox, ComboBox, DiffView, HBox, Label, raven, runApp, useFrame, VBox, type WidgetInstance } from "@decky.fx/raven-tsx/react";

const SAMPLES = `${import.meta.dir}/../samples`;

/** The context of each item of the combo box: unchanged lines around a change, -1 for every line. */
const CONTEXTS = [3, 10, -1] as const;

/** What the status line says: where the view is, and the line clicked last. */
function statusOf(diff: raven.Rid, line: string): string {
	const count = raven.Rdiff_view_get_change_count(diff);
	const current = raven.Rdiff_view_get_current_change(diff);
	const where = current >= 0 ? `Change ${current + 1} of ${count}` : `${count} changes`;
	return line ? `${where}  -  ${line}` : where;
}

function App(): ReactNode {
	const diff = useRef<WidgetInstance>(null);
	const [split, setSplit] = useState(process.env["RAVEN_DIFF_MODE"] !== "unified");
	const [spaces, setSpaces] = useState(false);
	const [context, setContext] = useState(0);
	const [line, setLine] = useState("");
	const [status, setStatus] = useState("");

	/** Gives the keyboard back to the view, and says where it is. */
	const refresh = (clicked = line): void => {
		const widget = diff.current?.widget;
		if (widget !== undefined) {
			diff.current?.focus();
			setStatus(statusOf(widget, clicked));
		}
	};

	// (once the files are read: a review comment on the line that adds the logging, and the change asked for)
	useEffect(() => {
		const widget = diff.current?.widget;
		if (widget === undefined) {
			return;
		}
		raven.Rdiff_view_add_annotation(widget, raven.R_DIFF_RIGHT, 62, "Is localtime() safe here? The server may get threads later.");
		const change = process.env["RAVEN_DIFF_CHANGE"];
		if (change) {
			raven.Rdiff_view_go_to_change(widget, Number(change));
		}
		refresh();
	}, []);

	// (the changes are counted again when the mode, the spaces or the context change)
	useEffect(() => refresh(), [split, spaces, context]);

	// (F7 and Shift+F7 move to a change inside the view, with no callback: the status follows it at
	// the next frame; the same text sets no state)
	useFrame(() => {
		const widget = diff.current?.widget;
		if (widget !== undefined) {
			setStatus(statusOf(widget, line));
		}
	});

	const next = (): void => {
		const widget = diff.current?.widget;
		if (widget !== undefined && raven.Rdiff_view_next_change(widget) < 0) {
			raven.Rdiff_view_go_to_change(widget, 0);
		}
		refresh();
	};

	const previous = (): void => {
		const widget = diff.current?.widget;
		if (widget !== undefined && raven.Rdiff_view_prev_change(widget) < 0 && raven.Rdiff_view_get_change_count(widget) > 0) {
			raven.Rdiff_view_go_to_change(widget, raven.Rdiff_view_get_change_count(widget) - 1);
		}
		refresh();
	};

	return (
		<VBox Spacing={12} Slot={{ Padding: 18 }}>
			<HBox Spacing={10}>
				<VBox Spacing={2} Slot={{ Fill: 1 }}>
					<Label Text="Diff view" TextSize={24} />
					<Label Name="status" Text={status} Opacity={0.6} />
				</VBox>
				<Checkbox Name="split" Text="Side by side" Style="Switch" Checked={split} OnChanged={setSplit} Slot={{ VAlign: "Center" }} />
				<Checkbox Name="spaces" Text="Ignore spaces" Style="Switch" Checked={spaces} OnChanged={setSpaces} Slot={{ VAlign: "Center" }} />
				<ComboBox Name="context" Items={["3 lines of context", "10 lines of context", "Every line"]} Selected={context} OnChanged={setContext} Slot={{ VAlign: "Center" }} />
				<Button Name="previous" Text="Previous" OnClicked={previous} Slot={{ VAlign: "Center" }} />
				<Button Name="next" Text="Next change" Class="primary" OnClicked={next} Slot={{ VAlign: "Center" }} />
			</HBox>

			<DiffView
				ref={diff}
				Name="diff"
				Mode={split ? "Split" : "Unified"}
				IgnoreWhitespace={spaces ? "All" : "None"}
				Context={CONTEXTS[context] ?? 3}
				LeftSource={`${SAMPLES}/v1.0/server.c`}
				RightSource={`${SAMPLES}/v1.1/server.c`}
				LeftName="v1.0/server.c"
				RightName="v1.1/server.c"
				OnLineClicked={(side, number, inGutter) => {
					const clicked = `${side === "Left" ? "left" : "right"} line ${number}${inGutter ? " (its number)" : ""}`;
					setLine(clicked);
					refresh(clicked);
				}}
				Slot={{ Fill: 1 }}
			/>

			<Label Text="F7 / Shift+F7 or Alt+Down / Alt+Up: next / previous change  -  click a fold to open it  -  drag to select, Ctrl+C to copy" Opacity={0.5} />
		</VBox>
	);
}

await runApp(<App />, { Title: "Raven diff view", Width: 1180, Height: 760 }, {
	setup: () => raven.Rlook_set(process.env["RAVEN_DIFF_THEME"] === "light" ? raven.R_LOOK_RAVEN_LIGHT : raven.R_LOOK_RAVEN_DARK),
});
