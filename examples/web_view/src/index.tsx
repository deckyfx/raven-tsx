/**
 * A web page shown by the engine of the system (WKWebView on macOS), with a toolbar and a panel
 * drawn by Raven. The port of `examples/web_view` of Raven.
 *
 *   <SystemWebView Source="...">        shows a page; the toolbar loads others through a ref
 *   Rsystem_web_view_run_javascript     the application acts on the page, and reads its answer
 *   window.raven.postMessage(v)         the page talks to the application: OnMessage
 *
 * `OnPageEvent` says what happens in the page (another address, a title, a load that starts, ends
 * or fails), and the panel reads the page again then. Where the system has no web view Raven can
 * embed (Windows, Linux for now), the widget shows a message in place of the page; the `browser`
 * example shows pages with an installed browser there.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, ColorPicker, HBox, Label, raven, runApp, Separator, SystemWebView, TextInput, VBox, webCallback, type WidgetInstance } from "@decky.fx/raven-tsx/react";

const WELCOME_PAGE = `${import.meta.dir}/../pages/welcome.html`;

/** What the panel and the toolbar show of the page. */
interface PageState {
	readonly title: string;
	readonly status: string;
	readonly canGoBack: boolean;
	readonly canGoForward: boolean;
}

/** Reads the page, as it is now. */
function readPage(page: raven.Rid): PageState & { readonly url: string } {
	const error = raven.Rsystem_web_view_get_error(page) ?? "";
	const status = !raven.Rsystem_web_view_is_supported() ? "This system has no web view Raven can embed." : error || (raven.Rsystem_web_view_is_loading(page) ? "Loading..." : "Loaded");
	return {
		url: raven.Rsystem_web_view_get_url(page) ?? "",
		title: raven.Rsystem_web_view_get_title(page) ?? "",
		status,
		canGoBack: raven.Rsystem_web_view_can_go_back(page) !== 0,
		canGoForward: raven.Rsystem_web_view_can_go_forward(page) !== 0,
	};
}

/** An address typed without a scheme is a web site. */
const toUrl = (text: string): string => (text.includes("://") || text.startsWith("about:") ? text : `https://${text}`);

function App(): ReactNode {
	const page = useRef<WidgetInstance>(null);
	const [state, setState] = useState<PageState>({ title: "", status: "", canGoBack: false, canGoForward: false });
	const [address, setAddress] = useState("");
	/** The address the bar was last given by the page: what is typed stays while a page loads. */
	const shownUrl = useRef("");
	const [log, setLog] = useState("*Nothing yet: press a button of the page.*");
	const messages = useRef(0);

	const picker = useRef<WidgetInstance>(null);

	const view = (): raven.Rid => page.current?.widget ?? raven.R_INVALID_ID;

	const refresh = (): void => {
		const next = readPage(view());
		if (next.url && next.url !== shownUrl.current) {
			shownUrl.current = next.url;
			setAddress(next.url);
		}
		setState(next);
	};

	// (the page as it starts, and the color of the picker: what it holds is the user's, so not a prop)
	useEffect(() => {
		refresh();
		if (picker.current) {
			raven.Rcolor_picker_set_hex(picker.current.widget, "#7C5CFF");
		}
	}, []);

	const go = (text: string): void => {
		if (text) {
			raven.Rsystem_web_view_load_url(view(), toUrl(text));
			page.current?.focus();
		}
	};

	/** A widget of Raven changes the page: the color picker sets a CSS variable. */
	const tint = (hex: string): void => {
		raven.Rsystem_web_view_run_javascript(view(), `document.documentElement.style.setProperty('--accent', '${hex}')`, null);
	};

	/**
	 * What receives the answers of the scripts: one native callback for every request, as the original
	 * gives one C function. A function given at each call would be a new native callback each time,
	 * which the binding keeps for ever. (`webCallback("result")` has the shape of
	 * `RSystemWebViewResultCallback`: the view, the result, the error.)
	 */
	const answer = useRef<ReturnType<typeof webCallback> | null>(null);

	/** The answer of a script, as JSON. */
	const askSize = (): void => {
		answer.current ??= webCallback("result", (_view, result, error) =>
			setLog(result ? `The page answered:\n\n\`${result.slice(0, 300)}\`` : `The script failed: ${(error ?? "").slice(0, 300)}`),
		);
		raven.Rsystem_web_view_run_javascript(view(), "({ width: innerWidth, height: innerHeight, links: document.links.length, engine: navigator.vendor })", answer.current);
	};

	return (
		<VBox>
			<HBox Spacing={8} Slot={{ Padding: [10, 8, 10, 8] }}>
				<Button Text="Back" Style="Flat" Enabled={state.canGoBack} OnClicked={() => raven.Rsystem_web_view_go_back(view())} />
				<Button Text="Forward" Style="Flat" Enabled={state.canGoForward} OnClicked={() => raven.Rsystem_web_view_go_forward(view())} />
				<Button Text="Reload" Style="Flat" OnClicked={() => raven.Rsystem_web_view_reload(view())} />
				<Button Text="Home" Style="Flat" OnClicked={() => raven.Rsystem_web_view_load_file(view(), WELCOME_PAGE)} />
				<TextInput Name="address" Placeholder="Address: https://..." Text={address} OnChanged={setAddress} OnCommitted={go} Slot={{ Fill: 1 }} />
			</HBox>
			<Separator />
			<HBox Slot={{ Fill: 1 }}>
				<SystemWebView
					ref={page}
					Name="page"
					Source={WELCOME_PAGE}
					OnPageEvent={refresh}
					OnMessage={(message) => setLog(`Message **${++messages.current}**:\n\n\`${message.slice(0, 600)}\``)}
					Slot={{ Fill: 1 }}
				/>
				<Separator Orientation="Vertical" />
				<VBox Width={290} Spacing={10} Slot={{ Padding: 14 }}>
					<Label Name="title" Text={state.title} TextSize={17} Wrap />
					<Label Name="status" Text={state.status} Opacity={0.6} Wrap />
					<Separator />
					<Label Text="From Raven to the page" Opacity={0.6} />
					<Label Markdown Wrap>This color picker is a widget of Raven. It sets a **CSS variable** of the page with `Rsystem_web_view_run_javascript`.</Label>
					<ColorPicker ref={picker} Name="tint" Previous="#7C5CFF" Alpha={false} Compact OnChanged={tint} />
					<Button Text="Ask the page for its size" OnClicked={askSize} />
					<Separator />
					<Label Text="From the page to Raven" Opacity={0.6} />
					<Label Name="log" Markdown Wrap Text={log} />
				</VBox>
			</HBox>
		</VBox>
	);
}

await runApp(<App />, { Title: "Raven - system web view", Width: 1120, Height: 720, MinWidth: 720, MinHeight: 460 }, {
	setup: () => {
		raven.Rtheme_apply(raven.R_THEME_DARK);
		if (!raven.Rsystem_web_view_is_supported()) {
			console.error("This system has no web view Raven can embed: the page is replaced by a message.");
		}
	},
});
