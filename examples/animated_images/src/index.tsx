/**
 * Animated GIF and APNG files shown by `Image` widgets: a spinner (GIF with a transparent color),
 * a bouncing ball (APNG with an alpha channel) and a countdown that plays once and says so. The
 * buttons play, pause and stop them all; the slider shows a frame of the ball; the switch turns
 * the animations off, as reduced motion does. The port of `examples/animated_images` of Raven.
 *
 * Playing is an action, not state: the buttons call `Rimage_play`, `Rimage_pause`, `Rimage_stop`
 * through refs. `Loop` is a prop, and `OnFinished` says when the countdown played its last time.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Border, Button, Checkbox, HBox, Image, Label, raven, runApp, Slider, UniformGrid, VBox, type WidgetInstance } from "@decky.fx/raven-tsx/react";

const ASSETS = `${import.meta.dir}/../assets`;

/** A card of the grid: an image, its name and what it is. */
function Card({ name, children, info }: { name: string; children: ReactNode; info: string }): ReactNode {
	return (
		<Border CornerRadius={14} Padding={18}>
			<VBox Spacing={8}>
				{children}
				<Label Text={name} TextSize={16} Slot={{ HAlign: "Center" }} />
				<Label Text={info} Opacity={0.6} Slot={{ HAlign: "Center" }} />
			</VBox>
		</Border>
	);
}

function App(): ReactNode {
	const spinner = useRef<WidgetInstance>(null);
	const ball = useRef<WidgetInstance>(null);
	const countdown = useRef<WidgetInstance>(null);
	const images: readonly RefObject<WidgetInstance | null>[] = [spinner, ball, countdown];
	const [ballInfo, setBallInfo] = useState("ball.png");
	const [frames, setFrames] = useState(24);
	const [finished, setFinished] = useState(false);
	const [reduce, setReduce] = useState(false);

	const each = (run: (image: raven.Rid) => void): void => {
		for (const image of images) {
			if (image.current) {
				run(image.current.widget);
			}
		}
	};

	// (what the file of the ball says, once it is read)
	useEffect(() => {
		const widget = ball.current?.widget;
		if (widget !== undefined) {
			setFrames(raven.Rimage_get_frame_count(widget));
			setBallInfo(`ball.png  -  ${raven.Rimage_get_frame_count(widget)} frames, ${raven.Rimage_get_duration(widget).toFixed(2)} s`);
		}
	}, []);

	useEffect(() => {
		raven.Rset_animations_enabled(reduce ? 0 : 1);
	}, [reduce]);

	const replay = (): void => {
		const widget = countdown.current?.widget;
		if (widget !== undefined) {
			raven.Rimage_stop(widget);
			raven.Rimage_play(widget);
		}
		setFinished(false);
	};

	/** The slider shows a frame of the ball, which stops there. */
	const seek = (value: number): void => {
		const widget = ball.current?.widget;
		if (widget !== undefined) {
			raven.Rimage_pause(widget);
			raven.Rimage_set_frame(widget, Math.round(value));
		}
	};

	return (
		<VBox Spacing={16} Slot={{ Padding: 24 }}>
			<HBox Spacing={12}>
				<VBox Spacing={2} Slot={{ Fill: 1 }}>
					<Label Text="Animated images" TextSize={26} />
					<Label Text="GIF and APNG play in an Image, on the clock of the animations, only while they are shown" Opacity={0.6} />
				</VBox>
				<Checkbox Name="reduce" Text="Reduce motion" Style="Switch" Checked={reduce} OnChanged={setReduce} Slot={{ VAlign: "Center" }} />
			</HBox>

			<UniformGrid Columns={3} Spacing={16} Slot={{ Fill: 1 }}>
				{/* a spinner: a GIF with a transparent color, each frame cleared after it, forever */}
				<Card name="spinner.gif" info="GIF, transparent color, loops forever">
					<Image ref={spinner} Name="spinner" Source={`${ASSETS}/spinner.gif`} Width={96} Height={96} Slot={{ HAlign: "Center", Fill: 1 }} />
				</Card>
				{/* a ball: an APNG with an alpha channel (the soft shadow); the slider below shows its frames */}
				<Card name={ballInfo} info="APNG, alpha, loops forever">
					<Image ref={ball} Name="ball" Source={`${ASSETS}/ball.png`} Width={120} Height={100} Slot={{ HAlign: "Center", Fill: 1 }} />
				</Card>
				{/* a countdown that plays once (the file says twice), and says when it ends */}
				<Card name={finished ? "countdown.gif  -  done" : "countdown.gif"} info="GIF, plays once, then says so">
					<Image ref={countdown} Name="countdown" Source={`${ASSETS}/countdown.gif`} Loop={1} OnFinished={() => setFinished(true)} Width={96} Height={96} CornerRadius={48} Slot={{ HAlign: "Center", Fill: 1 }} />
				</Card>
			</UniformGrid>

			<HBox Spacing={10}>
				<Button Name="play" Text="Play" Style="Primary" OnClicked={() => each(raven.Rimage_play)} />
				<Button Text="Pause" OnClicked={() => each(raven.Rimage_pause)} />
				<Button Text="Stop" OnClicked={() => each(raven.Rimage_stop)} />
				<Button Text="Replay countdown" OnClicked={replay} />
				<Label Text="Frame of the ball" Opacity={0.6} Slot={{ VAlign: "Center" }} />
				<Slider Name="seek" Min={0} Max={Math.max(frames - 1, 0)} Step={1} OnChanged={seek} Slot={{ Fill: 1, VAlign: "Center" }} />
			</HBox>
		</VBox>
	);
}

await runApp(<App />, { Title: "Raven animated images", Width: 860, Height: 440 }, { setup: () => raven.Rtheme_apply(raven.R_THEME_DARK) });
