/**
 * Notifications of the system with a tag, buttons and an icon (`Rnotification_show_desc`), and what
 * the user does with them (`Rnotification_set_callback`): a click on the notification, which also
 * brings this window back, a click on one of its buttons, or its dismissal. The port of
 * `examples/notifications` of Raven.
 *
 * Where the system shows none (Linux without a notification server, macOS outside of an
 * application bundle, a headless run), they are shown in the Toast at the bottom right of the
 * window instead, with the same buttons and the same callback (`Rnotification_set_fallback_toast`).
 *
 * The notifications belong to the application, not to a widget, so they have no props: they are
 * shown with the C API, and the callback, given once, puts what happened in state.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Border, Button, Checkbox, HBox, inEventScope, Label, Overlay, raven, runApp, Toast, VBox, type WidgetInstance } from "@decky.fx/raven-tsx/react";

const CHAT_ICON = `${import.meta.dir}/../chat.svg`;

/** The buttons of a notification: an id the callback is given, and a label. */
type Actions = readonly (readonly [id: string, label: string])[];

const MESSAGE_ACTIONS: Actions = [["reply", "Reply"], ["later", "Remind me"]];
const BUILD_ACTIONS: Actions = [["open", "Open folder"]];

/** Shows a notification, or replaces the one of the same tag. Whether the system (or the toast) took it. */
function notify(window: raven.Rid, tag: string, title: string, body: string, urgency: raven.RNotificationUrgency, actions: Actions = [], icon: string | null = null): boolean {
	const desc = new raven.RNotificationDesc();
	desc.size = raven.RNotificationDesc.SIZE;
	desc.tag = tag;
	desc.title = title;
	desc.body = body;
	desc.urgency = urgency;
	desc.actions = actions.map(([id, label]) => {
		const action = new raven.RNotificationAction();
		action.id = id;
		action.label = label;
		return action;
	});
	desc.action_count = actions.length;
	desc.icon = icon;
	desc.window = window;
	return raven.Rnotification_show_desc(desc) !== 0;
}

/** What the window says of where the notifications go. */
function whereText(): string {
	if (!raven.Rnotification_is_supported()) {
		return "The system shows none here: they are shown in the toast below, with their buttons";
	}
	const yesNo = (feature: number): string => (raven.Rnotification_supports(feature) ? "yes" : "no");
	return `Shown by the system (buttons: ${yesNo(raven.R_NOTIFICATION_FEATURE_ACTIONS)}, dismissals reported: ${yesNo(raven.R_NOTIFICATION_FEATURE_DISMISSED)}); by the toast below when it cannot`;
}

function App(): ReactNode {
	const toast = useRef<WidgetInstance>(null);
	const [front, setFront] = useState(true);
	const [log, setLog] = useState<readonly string[]>([]);
	const [where] = useState(whereText);
	const window = (): raven.Rid => (toast.current ? raven.Rwidget_get_window(toast.current.widget) : raven.R_INVALID_ID);

	// (once: the toast that shows what the system cannot, and what the user does, newest first)
	useEffect(() => {
		if (toast.current) {
			raven.Rnotification_set_fallback_toast(toast.current.widget);
		}
		raven.Rnotification_set_callback(inEventScope((tag: string | null, event: number, action: string | null) => {
			const what = event === raven.R_NOTIFICATION_ACTIVATED ? "clicked" : event === raven.R_NOTIFICATION_ACTION_INVOKED ? `button "${action ?? ""}"` : "dismissed";
			setLog((lines) => [`${tag ?? ""}: ${what}`, ...lines]);
		}));
		// (for the automated runs that capture the window)
		if (process.env["RAVEN_EXAMPLE_FRAMES"]) {
			notify(window(), "build", "Build finished", "raven_notifications built in 4.2 s", raven.R_NOTIFICATION_LOW, BUILD_ACTIONS);
			notify(window(), "chat-ada", "Ada Lovelace", "Are we still on for tonight?", raven.R_NOTIFICATION_NORMAL, MESSAGE_ACTIONS, CHAT_ICON);
		}
		return () => {
			raven.Rnotification_set_callback(null);
			raven.Rnotification_set_fallback_toast(raven.R_INVALID_ID);
		};
	}, []);

	useEffect(() => raven.Rnotification_set_bring_to_front(front ? 1 : 0), [front]);

	return (
		<Overlay>
			<VBox Spacing={16} Slot={{ Padding: 24 }}>
				<VBox Spacing={2}>
					<Label Text="Notifications" TextSize={26} />
					<Label Name="where" Text={where} Opacity={0.6} />
				</VBox>
				<HBox Spacing={10}>
					<Button Text="Message with buttons" Style="Primary" OnClicked={() => notify(window(), "chat-ada", "Ada Lovelace", "Are we still on for tonight?", raven.R_NOTIFICATION_NORMAL, MESSAGE_ACTIONS, CHAT_ICON)} />
					{/* (the same tag: the notification shown is replaced, not added to) */}
					<Button Text="Replace it" OnClicked={() => notify(window(), "chat-ada", "Ada Lovelace", "Running a little late: 8 pm?", raven.R_NOTIFICATION_NORMAL, MESSAGE_ACTIONS, CHAT_ICON)} />
					<Button Text="Close it" OnClicked={() => raven.Rnotification_close("chat-ada")} />
					<Button Text="Build finished" OnClicked={() => notify(window(), "build", "Build finished", "raven_notifications built in 4.2 s", raven.R_NOTIFICATION_LOW, BUILD_ACTIONS)} />
					<Button Text="Critical" OnClicked={() => notify(window(), "disk", "Disk almost full", "Less than 1 GB is left on the system disk", raven.R_NOTIFICATION_CRITICAL)} />
				</HBox>
				<Checkbox Name="front" Text="A click on a notification brings this window back" Style="Switch" Checked={front} OnChanged={setFront} />
				<Label Text="What the user did" Opacity={0.6} />
				<Border CornerRadius={10} Padding={12} Background="#80808018" Slot={{ Fill: 1 }}>
					<Label Name="log" Wrap Text={log.length > 0 ? log.join("\n") : "Nothing yet: minimize the window, show a notification and click it or one of its buttons."} />
				</Border>
			</VBox>
			<Toast ref={toast} Name="toast" Queue="Stack" MaxVisible={3} Duration={8} Slot={{ HAlign: "Right", VAlign: "Bottom", Padding: 20 }} />
		</Overlay>
	);
}

await runApp(<App />, { Title: "Raven notifications", Width: 900, Height: 560 }, { setup: () => raven.Rtheme_apply(raven.R_THEME_DARK) });
