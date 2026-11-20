import { createSignal, For, onSettled, Show } from "solid-js";
import { Button, Checkbox, HBox, Label, TextInput, VBox, type JSX } from "@decky.fx/raven-tsx/solid";

/** A row of the list. Two rows can have the same text, so the id is what tells them apart. */
interface Item {
	readonly id: number;
	readonly text: string;
}

let nextItemId = 0;

/** A new row with its own id. */
function newItem(text: string): Item {
	return { id: ++nextItemId, text };
}

/**
 * Signals, typed text, a timer, a condition and a list: the component runs once, and the signals
 * change the widgets. A write is seen once Solid flushes (at the end of the event that made it), so
 * a handler computes the next value from the one the setter gives it.
 */
export function App(): JSX.Element {
	const [clicks, setClicks] = createSignal(0);
	const [name, setName] = createSignal("");
	const [shout, setShout] = createSignal(false);
	const [seconds, setSeconds] = createSignal(0);
	const [items, setItems] = createSignal<readonly Item[]>([newItem("Apples"), newItem("Pears")]);

	// (started once the window is shown, and stopped with the component: the cleanup onSettled returns)
	onSettled(() => {
		const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
		return () => clearInterval(timer);
	});

	const greeting = (): string => `Hello, ${name() || "World"}!`;

	return (
		<VBox Spacing={12} Slot={{ Padding: 16 }}>
			<Label TextSize={24}>{shout() ? greeting().toUpperCase() : greeting()}</Label>
			<TextInput Placeholder="Your name" Text={name()} OnChanged={setName} />
			<Checkbox Checked={shout()} OnChanged={setShout}>Shout</Checkbox>
			<HBox Spacing={12}>
				<Button Style="Primary" OnClicked={() => setClicks((value) => value + 1)}>Click me</Button>
				<Label Opacity={0.7}>{clicks() === 0 ? "Not clicked yet" : `Clicked ${clicks()} time(s)`}</Label>
			</HBox>
			<Show when={clicks() >= 3}>
				<Label>You like clicking.</Label>
			</Show>
			<Label Opacity={0.7}>Open for {seconds()} s</Label>
			<HBox Spacing={8}>
				<Button OnClicked={() => setItems((list) => [...list, newItem(name() || `Item ${list.length + 1}`)])}>Add</Button>
				<Button OnClicked={() => setItems((list) => [...list].reverse())}>Reverse</Button>
			</HBox>
			<For each={items()}>
				{(item) => (
					<HBox Spacing={8}>
						<Label Slot={{ Fill: 1 }}>{item.text}</Label>
						<Button OnClicked={() => setItems((list) => list.filter((other) => other.id !== item.id))}>Remove</Button>
					</HBox>
				)}
			</For>
		</VBox>
	);
}
