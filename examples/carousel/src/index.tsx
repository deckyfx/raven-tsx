/**
 * An onboarding in five pages: a `Carousel` whose children are the pages. The port of
 * `examples/carousel` of Raven.
 *
 * The pages are swiped with the mouse, a finger or two fingers on a trackpad, turned with the
 * arrow keys, the dots, the arrows shown under the pointer, and the Back and Next buttons below;
 * the switches turn the loop, the autoplay and the vertical orientation on.
 *
 * The page is React state: `OnChanged` says where the user (or the autoplay) went, and the line
 * below the pages follows it. Back and Next glide to their page through a ref, as the `Page` prop
 * shows its page at once (`Rcarousel_next`, `Rcarousel_prev` and `Rcarousel_set_page` with
 * `animated` have no prop).
 *
 * Not ported: RAVEN_CAROUSEL_SWIPE, the input the original injects frame after frame (a drag, a
 * click on a dot, a drag let go early) for the automated runs that film it. It is a test of the
 * widget, not something the example shows.
 */

import { useRef, useState, type ReactNode } from "react";
import { Border, Button, Carousel, Checkbox, HBox, Label, raven, runApp, VBox, type WidgetInstance } from "@decky.fx/raven-tsx/react";

/** Seconds between the pages turned by the autoplay. */
const AUTOPLAY_SECONDS = 3;

/** A page of the onboarding. */
interface PageData {
	/** Its title: the name of the page for the screen readers (`Slot.Title`), and in the line below the pages. */
	readonly title: string;
	readonly background: string;
	readonly heading: string;
	readonly text: string;
	/** A button on the page, to show that any widget can be on one. */
	readonly button?: string;
}

const PAGES: readonly PageData[] = [
	{
		title: "Welcome",
		background: "#5B5BD6",
		heading: "Welcome to Raven",
		text: "A small C library for fast, good-looking interfaces, on every desktop and in the browser.",
	},
	{
		title: "Swipe",
		background: "#12A594",
		heading: "Swipe the pages",
		text: "They follow the pointer, a finger or two fingers on a trackpad, stretch at the ends and settle on the nearest page.",
	},
	{
		title: "Pages",
		background: "#F76B15",
		heading: "Any widget is a page",
		text: "Pictures, forms, whole screens: only the page shown is drawn and reached by the mouse and the keyboard.",
		button: "A button on a page",
	},
	{
		title: "Dots",
		background: "#D6409F",
		heading: "Dots and arrows",
		text: "The current dot slides with the pages. The arrows come with the pointer; the keys and the wheel turn the pages too.",
	},
	{
		title: "Ready",
		background: "#0090FF",
		heading: "Loop and autoplay",
		text: "Turn on the switches above: the last page leads to the first, and the pages turn by themselves until the pointer comes.",
	},
];

/** One page: its number in a circle, a heading and a few words, on its color. */
function OnboardingPage({ number, page }: { readonly number: number; readonly page: PageData }): ReactNode {
	return (
		<Border Background={page.background} CornerRadius={20} Padding={56} Slot={{ Title: page.title }}>
			<VBox Spacing={14} Slot={{ HAlign: "Center", VAlign: "Center" }}>
				<Border Width={84} Height={84} CornerRadius={42} Background="#FFFFFF2E" Slot={{ HAlign: "Center" }}>
					<Label TextSize={38} Color="white" Slot={{ HAlign: "Center", VAlign: "Center" }}>{number}</Label>
				</Border>
				<Label TextSize={34} Color="white" Slot={{ HAlign: "Center" }}>{page.heading}</Label>
				<Label Color="#FFFFFFD0" TextSize={17} TextAlign="Center" Wrap MaxWidth={520} Slot={{ HAlign: "Center" }}>{page.text}</Label>
				{page.button !== undefined && <Button Slot={{ HAlign: "Center" }}>{page.button}</Button>}
			</VBox>
		</Border>
	);
}

/** The whole window: the title and the switches, the pages, and the line that follows them. */
function App(): ReactNode {
	const carousel = useRef<WidgetInstance>(null);
	const [page, setPage] = useState(0);
	const [loop, setLoop] = useState(false);
	const [autoplay, setAutoplay] = useState(false);
	const [vertical, setVertical] = useState(false);
	const last = page === PAGES.length - 1;

	/**
	 * Glides with the C function given, then takes the page it arrived at as the state. (The
	 * widget holds that page already, so the `Page` prop is not set again: the glide goes on.)
	 */
	const glide = (turn: (widget: raven.Rid) => void): void => {
		const widget = carousel.current?.widget;
		if (widget !== undefined) {
			turn(widget);
			setPage(raven.Rcarousel_get_page(widget));
		}
	};

	const back = (): void => glide(raven.Rcarousel_prev);

	const next = (): void => {
		// the last page: the application would go on to its own screens
		if (last && !loop) {
			glide((widget) => raven.Rcarousel_set_page(widget, 0, raven.R_TRUE));
		} else {
			glide(raven.Rcarousel_next);
		}
	};

	return (
		<VBox Spacing={16} Slot={{ Padding: 24 }}>
			<HBox Spacing={14}>
				<VBox Spacing={2} Slot={{ Fill: 1 }}>
					<Label TextSize={26}>Carousel</Label>
					<Label Opacity={0.6}>Swipe with the mouse, a finger or two fingers on a trackpad  -  arrow keys, Home, End  -  click a dot or an arrow</Label>
				</VBox>
				<Checkbox Style="Switch" Checked={loop} OnChanged={setLoop} Slot={{ VAlign: "Center" }}>Loop</Checkbox>
				<Checkbox Style="Switch" Checked={autoplay} OnChanged={setAutoplay} Slot={{ VAlign: "Center" }}>Autoplay</Checkbox>
				<Checkbox Style="Switch" Checked={vertical} OnChanged={setVertical} Slot={{ VAlign: "Center" }}>Vertical</Checkbox>
			</HBox>

			{/* (OnChanged: the user or the autoplay went to another page) */}
			<Carousel
				ref={carousel}
				Page={page}
				Loop={loop}
				Autoplay={autoplay ? AUTOPLAY_SECONDS : 0}
				Orientation={vertical ? "Vertical" : "Horizontal"}
				OnChanged={setPage}
				Slot={{ Fill: 1 }}
			>
				{PAGES.map((data, index) => <OnboardingPage key={data.title} number={index + 1} page={data} />)}
			</Carousel>

			<HBox Spacing={10}>
				<Label Opacity={0.7} Slot={{ VAlign: "Center", Fill: 1 }}>{`${PAGES[page]?.title ?? ""}  -  ${page + 1} / ${PAGES.length}`}</Label>
				<Button Enabled={loop || page > 0} OnClicked={back}>Back</Button>
				<Button Style="Primary" OnClicked={next}>{last && !loop ? "Get started" : "Next"}</Button>
			</HBox>
		</VBox>
	);
}

await runApp(<App />, { Title: "Raven carousel", Width: 960, Height: 640 }, {
	appName: "Raven carousel",
	setup: () => raven.Rtheme_apply(raven.R_THEME_DARK),
});
