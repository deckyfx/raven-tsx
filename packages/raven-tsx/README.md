# raven-tsx

Native desktop interfaces in TSX, for [Bun](https://bun.com), on the real widgets of [Raven](https://github.com/oscar-soirey/Raven). A core knows only Raven, and an adapter for a framework is built on it: there is one for React and one for [Solid](#solid). No XML, and with React no build step, as Bun compiles TSX itself.

```tsx
import { useState } from "react";
import { Button, Label, runApp, VBox } from "@decky.fx/raven-tsx/react";

function App() {
	const [count, setCount] = useState(0);
	return (
		<VBox Spacing={12} Slot={{ Padding: 24 }}>
			<Label>Clicked {count} times</Label>
			<Button Style="Primary" OnClicked={() => setCount(count + 1)}>Click me</Button>
		</VBox>
	);
}

await runApp(<App />, { Title: "Hello", Width: 480, Height: 240 });
```

![The studio example: a node graph and a timeline, in the Blueprint look](../../docs/screenshots/studio.png)

The C examples of Raven have a TSX port in [examples](../../examples), but for `transfer` and `mobile`, with screenshots in the [README of the repository](../../README.md).

## Install

    bun add @decky.fx/raven-tsx react react-reconciler

For Solid, see [Solid](#solid). The frameworks are optional peer dependencies: an application installs those of the adapter it uses, and one that uses only the core installs none.

| Import | What it is |
|---|---|
| `@decky.fx/raven-tsx/react` | The components, `runApp`, the hooks and `registerTag`, for React, and everything of the core |
| `@decky.fx/raven-tsx/solid` | The same for Solid, with `create...` functions in place of the hooks |
| `@decky.fx/raven-tsx/solid/preload`, `/solid/plugin` | The Bun plugin that compiles TSX for Solid: to preload, or to give `Bun.build` |
| `@decky.fx/raven-tsx` | The core, for code that is not a component: `defineTheme`, `loadTheme`, `raven`, `onAction`, `onShortcut`, `onFrame`, which each return what stops them, and the [services of the device](#the-device) |

```json
{ "compilerOptions": { "jsx": "react-jsx", "types": ["bun", "react"] } }
```

The package is TypeScript, so your compiler checks it with your settings (`skipLibCheck` skips only `.d.ts` files). It compiles with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (optional props take `undefined`, as React's do), `noPropertyAccessFromIndexSignature`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `isolatedModules` and `verbatimModuleSyntax`. Not yet with `erasableSyntaxOnly`: Raven's own binding has `enum`s.

Raven's native library comes with it: there is a package per platform, and the package manager installs the one that fits. No install script runs, and nothing is compiled on your machine.

| Platform | Package |
|---|---|
| Linux x64, arm64 | `@decky.fx/raven-tsx-linux-x64`, `-linux-arm64` |
| macOS Apple Silicon, Intel | `@decky.fx/raven-tsx-darwin-arm64`, `-darwin-x64` |
| Windows x64 | `@decky.fx/raven-tsx-win32-x64` |

What the system must have: on Linux and Windows a Vulkan driver, and on Linux libX11; on macOS, version 14 or newer, nothing else: Raven draws with Metal. An application that asks for Vulkan there (`backend: R_BACKEND_VULKAN` in the options of `runApp`, for a Vulkan `Viewport` or effects given as SPIR-V) needs MoltenVK: `brew install molten-vk`.

`RAVEN_LIBRARY` set to the path of a library has priority, to try a build of your own.

## One executable

`bun build --compile` holds Bun, your code and the native library in one file:

    bun build --compile src/index.tsx --outfile app

For another platform, install its package first:

    bun install --os=win32 --cpu=x64
    bun build --compile --target=bun-windows-x64 src/index.tsx --outfile app.exe

An application of Solid builds with `Bun.build` and the plugin, as [examples/solid-helloworld/build.ts](../../examples/solid-helloworld/build.ts) does.

## Solid

    bun add @decky.fx/raven-tsx solid-js@2 @solidjs/universal@2
    bun add -d @solidjs/compiler@~2.0.2

The package is written for Solid 2: `solid-js`, `@solidjs/universal`, on which its renderer is made, and Solid's compiler `@solidjs/compiler`, kept within its minor version, as what it compiles to must be what the renderer exports. With Solid 1, which has its renderer elsewhere and another compiler, the preload stops and says so. An application that stays on Solid 1 stays on raven-tsx 0.3.x, which is written for it (with `babel-preset-solid`, as its README says):

    bun add @decky.fx/raven-tsx@0.3

Solid compiles its JSX itself, with its own compiler, to calls of a renderer: Bun alone would compile it for React. The plugin of the package does that, and gives Solid's build for clients, as on Bun `solid-js` would otherwise be its build for servers, which does not react. Preload it, for `bun run` and `bun test`:

```toml
# bunfig.toml
preload = ["@decky.fx/raven-tsx/solid/preload"]

[test]
preload = ["@decky.fx/raven-tsx/solid/preload"]
```

```json
{ "compilerOptions": { "jsx": "preserve", "jsxImportSource": "@decky.fx/raven-tsx/solid", "types": ["bun"] } }
```

The types of JSX come from the package: Solid 2 leaves them to its renderers, and those of `@solidjs/web` are the DOM's.

```tsx
import { createSignal } from "solid-js";
import { Button, Label, runApp, VBox } from "@decky.fx/raven-tsx/solid";

function App() {
	const [count, setCount] = createSignal(0);
	return (
		<VBox Spacing={12} Slot={{ Padding: 24 }}>
			<Label>Clicked {count()} times</Label>
			<Button Style="Primary" OnClicked={() => setCount((value) => value + 1)}>Click me</Button>
		</VBox>
	);
}

await runApp(() => <App />, { Title: "Hello", Width: 480, Height: 240 });
```

The components, their props, events, windows, themes and tags are the same as with React, on the same core; what differs is Solid's:

- `runApp`, `RavenRoot.render` and `createWindow().root.render` take a function that returns the tree, as Solid's `render` does.
- A component runs once, and a signal changes only the widgets that read it. A handler's change is on the widgets when the handler returns, so a controlled `TextInput` or `Checkbox` works as with React.
- As everywhere in Solid 2, a write is read once Solid flushes: at the end of the event that runs the handler, at the next microtask (a timer's), or at `flush()` from `solid-js`. In a handler, `setCount((value) => value + 1)` counts each click, where reading `count()` again after a write still gives the value before it.
- What runs once the tree is shown, and stops with the component, goes in `onSettled`, which returns its cleanup (Solid 1's `onMount`). An error in the tree reaches the nearest `<Errored>` (Solid 1's `<ErrorBoundary>`). One that no `<Errored>` catches in an update (after a click, a timer) is uncaught: Solid stops in every tree and gives it to `reportError`, which ends the program on Bun and Node.js as any uncaught exception does. An application puts an `<Errored>` around what may throw. A render that throws is different: its tree goes, the error goes to the caller of `render` (or `runApp`), and Solid works again for the next.
- An empty text is no text: `{""}`, or an expression that gives `""`, makes nothing, where Solid 1 made an empty text. When all the text of a widget goes and no `Text` prop gives it one, its `Text` becomes `""`.
- `ref` receives the `WidgetInstance` once Raven has the widget, placed, as React's does: `ref={(input) => input.focus()}` works. An element never placed gives no ref. The `WindowInstance` of a `<Window>` comes when the element is made; the window opens once it is placed.
- `createAction(name, handler)`, `createShortcut(() => window, keys, handler)` and `createFrame(handler)` are the hooks of React, and last as long as the component that calls them.
- `<Portal widget={handle}>` renders into a widget made by hand, as `createPortal` does with React.
- `registerTag` takes a Solid component, whose props follow the attributes of its element.
- An element kept in a variable and shown again (`<Show>`) keeps its widget; one whose component is gone is deleted.

## Node.js

The package also runs under Node.js, with React and Solid, on Linux, macOS and Windows. Raven's Node-API binding replaces bun:ffi there; it comes in the package of the platform, as the library does.

    npm install @decky.fx/raven-tsx react react-reconciler

```js
import { createElement as h, useState } from "react";
import { Button, Label, runApp, VBox } from "@decky.fx/raven-tsx/react";

function App() {
	const [count, setCount] = useState(0);
	return h(VBox, { Spacing: 12 }, h(Label, null, `Clicked ${count} times`), h(Button, { OnClicked: () => setCount(count + 1) }, "Click me"));
}

await runApp(h(App), { Title: "Hello", Width: 480, Height: 240 });
```

TSX works through any compiler that turns it into JavaScript for Node.js, as with React elsewhere.

Solid compiles its TSX itself: the register of the package does it under Node.js (24 or newer), as the preload does on Bun, and gives Solid's build for clients. The TypeScript of an application is then taken away by Node.js, so it must be erasable, as Node.js runs TypeScript:

    npm install @decky.fx/raven-tsx solid-js@2 @solidjs/universal@2
    npm install -D @solidjs/compiler@~2.0.2
    node --import @decky.fx/raven-tsx/solid/register src/index.tsx

The files are those of [Solid](#solid) on Bun, unchanged.

For TypeScript the package has declarations of its own under Node.js (`"moduleResolution": "NodeNext"`), which need no types of Bun; resolved as a bundler (tsx, esbuild, Vite), the sources are the types, with `@types/bun`. `WebView` works on Node.js 26 too, through `node:ffi`, as Raven's Node.js binding has no `raven_web.h`: `node:ffi` is experimental there, and says so once on stderr. From Node.js 26.9 it is there by default; 26.1 to 26.8 need `--experimental-ffi`. With the permission model, it also needs `--allow-ffi`. On an older Node.js, `registerWebView` and `webFunctions()` throw a `RavenError` that says so. `SystemWebView`, the web engine of the system, is in the binding, and needs nothing more.

## How props work

The components, with their props, are generated from Raven's own schema.

| XML | TSX |
|---|---|
| `Text="Hi"` | `Text="Hi"`, or `<Label>Hi</Label>` |
| `Width="120"` | `Width={120}` |
| `Slot.Padding="24"` | `Slot={{ Padding: 24 }}`, since JSX has no dots in names |
| `Items="a\|b"` | `Items={["a", "b"]}` |
| `OnClicked="name"` | `OnClicked={() => ...}` |

## Events

Events with a value give it to the function, at each change. A `TextInput` gives its text in `OnChanged` and again in `OnCommitted` on Enter.

| Component | Event | Value |
|---|---|---|
| `TextInput` | `OnChanged`, `OnCommitted` | `string` |
| `Checkbox`, `Expander` | `OnChanged` | `boolean` |
| `Slider`, `SpinBox` | `OnChanged` | `number` |
| `ComboBox`, `TabView` | `OnChanged` | index |
| `ComboBox` | `OnTextChanged` | the text typed in an `Editable` or `Searchable` one |
| `ListView`, `TileView` | `OnChanged`, `OnActivated` | index |
| `TreeView` | `OnChanged`, `OnActivated` | handle of the item |
| `Table` | `OnChanged`, `OnActivated` | row |
| `Table` | `OnSort` | column, and whether it is descending |
| `Table` | `OnCellEdited` | row, column and the text typed in a cell of an `Editable` column |
| `DatePicker` | `OnChanged` | `"YYYY-MM-DD"` |
| `TimePicker` | `OnChanged` | `"HH:MM:SS"` |
| `Rating` | `OnChanged` | `number` |
| `Pagination` | `OnChanged` | page, from 0 |
| `PdfView` | `OnChanged` | page, from 1, as `Page` counts it |
| `Breadcrumb` | `OnClicked` | index |
| `Carousel` | `OnChanged` | page, from 0, as `Page` counts it |
| `Chart` | `OnSliceClicked` | slice, and whether it is now the selected one |
| `Chart` | `OnCellClicked` | row, column and value of a cell of a heatmap |
| `MapView` | `OnChanged` | latitude, longitude, zoom: where the user moved it |
| `MapView` | `OnMarkerClicked` | id of the marker, from 1: those of `Markup` in their order |
| `MapView` | `OnTile`, `OnTileCancelled` | z, x, y of a tile asked for, or no longer wanted |
| `TextEditor` | `OnChanged`, `OnCompletion` | its text, the start of the word |
| `TextEditor` | `OnZoom` | `number` |
| `ColorPicker` | `OnChanged` | `"#RRGGBB"`, or `"#RRGGBBAA"` when it is not opaque |
| `Label` | `OnLink` | the address of the link |
| `DiffView` | `OnLineClicked` | `"Left"` or `"Right"`, the line on that side from 1, and whether its number was clicked |
| `SystemWebView` | `OnMessage` | what the page sent with `window.raven.postMessage(value)` |
| `SystemWebView` | `OnPageEvent` | `"Navigated"`, `"Title"`, `"Loading"`, `"Loaded"` or `"Failed"` |
| `Image` | `OnFinished` | nothing: an animation stopped after its last play |
| `MenuItem` | `OnClicked` | whether it is checked now |
| `Island` | `OnChanged` | `boolean` |
| `Viewport`, `<Window>` | `OnResize` | width, height |
| `<Window>` | `OnKeyboard` | whether the keyboard on the screen shows, its height (mobile) |
| `FileBrowser` | `OnChanged`, `OnAccepted` | path |
| `DockArea` | `OnChanged` | its layout, for `Layout` or `Rdock_area_load_layout` |
| `TreeView`, `TileView`, `NodeGraph`, `BlockEditor` | `OnContext` | what was right clicked, x, y |
| `Timeline` | `OnTime` | seconds |
| `Timeline` | `OnItemChanged`, `OnSelection`, `OnActivated`, `OnRemoved` | item |
| `NodeGraph` | `OnLinked`, `OnUnlinked`, `OnMoved`, `OnSelection`, `OnRemoved`, `OnActivated` | link or node |
| `BlockEditor` | `OnChanged`, `OnClicked` | block |
| any widget, `<Window>` | `OnDrop` | an `RDropEvent` |
| any widget | `OnEvent` | an `REvent`, before the widget sees it: the pointer over a `Custom`, for one |

Some events ask: `OnClose` of a `TabView` (index, page) and of a `DockArea` (panel), `OnConnect` of a `NodeGraph` (two pins), and `OnEvent` and `OnDrop`, where true means taken. Return true to let the thing happen. `OnCellEdited` of a `Table` is the other way round, as nothing is the usual answer: it keeps the text unless the function returns false, and then the editor stays open on it, after Enter or Tab, for the user to correct. A tab or a panel that stays can then go by taking its element out, which is the way to do it: when Raven closes a panel by itself, it deletes a widget React still has, which does no harm but leaves the element with a `.widget` that is no longer valid. `Documents` on a `TabView` gives its tabs a close button.

Other events give nothing, and share the one action a widget has in Raven: give a widget one of them. `Timeline` and `NodeGraph` have an `OnChanged` of this kind, once per gesture.

A `MapView` asks for its tiles as it is drawn, in `OnTile`: answer with `Rmap_view_set_tile` (pixels) or `Rmap_view_set_tile_failed`, at once or later, or give it `TilePath` to read them from files. Its view is the user's to move: `OnChanged` says where it went, and a new `Latitude`, `Longitude` or `Zoom` moves it, but the props are not put back after an event. A `Table` with `MultiSelect` or `SelectionMode="Multiple"` keeps the rows the user selected in the same way; `Rtable_get_selection` reads them.

Inputs are controlled, as in React DOM. With `Text={value}`, what the state says stays on screen if a handler refuses a change. An update made in an event is committed before the next event, as a click in React DOM. `ListView` and `ComboBox` keep their `Selected` when their `Items` change. A `|` in an item would split it, as `Items` is written that way in XML: for such items use `ItemText`. An editable `ComboBox` holds its `Text` as a `TextInput` does. `FileBrowser`'s `Directory`, `Timeline`'s `Playing` and `TextEditor`'s `Search` (typed in its find bar) are not held this way: the user changes them with no event that says so.

## Windows

`<Window>` is an element like any other, anywhere in the tree: it opens with its element and closes with it. Without options, `runApp` lets the tree say what windows there are, and ends when the last one closes.

```tsx
function App() {
	const [help, setHelp] = useState(false);
	return (
		<>
			<Window Title="Main" Width={640} Height={480}>
				<Button OnClicked={() => setHelp(true)}>Help</Button>
			</Window>
			{help && <Window Title="Help" OnClose={() => setHelp(false)}><Label>...</Label></Window>}
		</>
	);
}

await runApp(<App />);
```

A tree that never opens a window never ends: Raven runs until a window has existed, so that one can open later. An application that renders nothing at all waits for ever, and wakes about 60 times a second.

A splash screen is a window like the others, with `IsSplashScreen`: no frame, centered, above the other windows and out of the taskbar. Render the main window beside it and take the splash out when the main window is ready.

```tsx
{loading && <Window IsSplashScreen Width={480} Height={280}><Label>Starting...</Label></Window>}
<Window Title="Main" Width={1024} Height={720}>...</Window>
```

With `OnClose`, closing is a request: the window stays until the element is taken out. Without it, the user can close the window at any time. `Title`, `Theme`, `Width`, `Height`, `Backdrop`, `Opacity` and `ContinuousRedraw` can change on an open window. Other attributes only count when it is made.

What a `<Window>` holds directly fills it and follows its `Slot`, as the content of a window in C. Several such children lie on top of each other: put them in a `<VBox>` to stack them.

On macOS a `MenuBar` goes to the menu bar of the system; `Native={false}` keeps it in the window. An `<Island>` directly in a `<Window>` floats above the content at the top, as in XML. A `<Menu>` that no `MenuBar` or `Menu` holds is not shown until it is asked: its ref has `open(x, y)`, in the coordinates `OnContext` gives. A `<Separator>` in a `<Menu>` is a line of the menu.

## Themes

A theme is a typed object, not a theme file: `defineTheme` checks it, and `loadTheme` gives it to Raven, which keeps it under its name. The colors and metrics take the names of Raven's schema, so a typo does not compile.

```tsx
import { defineTheme, loadTheme, raven } from "@decky.fx/raven-tsx/react";

export const ocean = defineTheme({
	Name: "Ocean",
	Base: "Dark",
	Accent: "#22D3EE",
	Colors: { Window: "#0B1220", Panel: "#111A2C", Text: "#DCE7F5" },
	Metrics: { ControlHeight: 32, Spacing: 8 },
	Syntax: { Keyword: "#7DD3FC", String: "#86EFAC" },
	Styles: [
		{ Widget: "Button", CornerRadius: 16 },
		{ Class: "danger", Accent: "#FB7185" },
		{ Widget: "Slider", Part: "Knob", State: "Hovered", Size: 16 },
	],
});

await runApp(<App />, options, { setup: () => raven.Rtheme_use(loadTheme(ocean)) });
```

`Theme={ocean.Name}` gives it to a part of the window only. Everything a theme file has is there: `Look` or `Base`, `Motion`, `Material`, `Font`, `Wallpaper`, `Colors`, `Metrics`, `Glass`, `Syntax`, and `Styles` for a type, a class, a part and its states. A mistake Raven finds (a `Base` that names no theme) is reported by Raven, and the rest is used, as in a file. `themeXml(theme)` gives the text of the theme file, to save one.

## Tags of your own

A component can be a tag Raven knows, built by Raven from XML as `<Button>` is: in a document made by code, in `Markup`, in a file of someone else. There is no XML declaration of it: the component is the only one.

```tsx
await runApp(<App />, options, {
	// (once Raven started: Raven refuses a tag before)
	setup: () => {
		registerTag("Card", Card, {
			attributes: { Title: "string", Wide: "boolean", Count: "number" },
			slots: ["footer"],
		});
		registerTag("Stat", Stat, { attributes: { Label: "string", Value: "string" } });
	},
});
```

```xml
<Card Title="Sales" Wide="true">
	<Stat Label="This week" Value="1 284"/>
	<Into Name="footer"><Button Text="Details"/></Into>
</Card>
```

`attributes` lists the attributes it takes, with the kind of their prop, checked against the component's props; the others stay with the widget (`Name`, `Width`, `Slot`...), and a value of the wrong kind is reported by Raven. The widgets of the children go where the component renders `children`, and those of `<Into Name="...">` where it renders the prop of that name, one of `slots`, with no box around them. Those it does not render are not shown, and stay alive until the element is destroyed. `Rwidget_set_attribute` renders it again, and destroying the widget unmounts it. Each element is a root of its own, so context does not reach it from around it. `registerTag` returns what unregisters the tag.

## Going beyond props

`useShortcut(window, "Ctrl+S", save)` adds a shortcut to a window, given the ref of its `<Window>`. `useAction("scene.play", play)` names a function, for whatever fires actions by name; it receives the widget that fired it. An `On...` prop also takes such a name, or a built-in action: `OnClicked="app.quit"`.

`useFrame((seconds) => ...)` runs a function once per frame, before the layout, in any number of components. It also runs when nothing is happening, about 60 times a second: `runApp` wakes that often so that Bun's timers run beside Raven. `raven.Rset_frame_callback` goes in the same slot as one more function, so neither takes the place of the other, and the last one it was given is the only one kept alive.

`runApp(<App />, options, { appName, setup, allocator })`: `setup` runs after Raven starts and before the first render, for a look or a theme. `allocator` is what `Rset_allocator` takes, functions of C only.

`Theme` takes the name of a theme loaded with `loadTheme` (or `Rtheme_load`), and `Language` a language that was registered, beside those the types propose. A color or a metric goes back to the theme with `null`, without making the widget again: `Color={{ Text: null }}`. `FontStyle` on a `Label` takes a style of the font of the theme, and does not go with `Font`.

A function given directly to the C API runs outside what props get. `inEventScope(fn)` makes it the same: an exception stays on this side, and what it changes in React is committed before the next event.

`createPortal(children, widget)`, as in ReactDOM, renders into a widget given to Raven by hand, the content of a graph node for one, and context goes on through it. `tag<Props>("Name")` makes a component for a tag given to `Rxml_register_tag`.

Children added with `Rwidget_add_child` to a parent React also fills stay in their place, through inserts and when the parent is made again. They are yours to delete.

Web pages need `registerWebView` once, as the `setup` of `runApp`, which runs before the first render. They are apart from the binding, as a library can be built without them, and `webFunctions()` gives the functions of `raven_web.h`.

Their functions take a text as a `Buffer` that ends with a zero, and a callback as the address `webCallback` makes, which lives for ever: `webCallback("message", (view, text) => ...)` for `Rweb_view_set_message_callback`, `"event"` for `Rweb_view_set_event_callback`, `"result"` for `Rweb_view_run_javascript`. It runs as a prop does, and is the same on Bun and on Node.js.

A `WebView` drives a browser of the Chromium family installed on the machine (Chrome, Chromium, Edge...), hidden, and shows its picture: there is none in the package. A `SystemWebView` shows the page with the web engine of the system instead, over the widget, where Raven has one (WKWebView on macOS and iOS; elsewhere it shows a message), and needs no `registerWebView`: its props are `Url`, `Source`, `Html` and `BaseUrl`, and its events `OnMessage` and `OnPageEvent`. So show something else when there is no browser (`Rweb_is_available()` is 0), and when the library has no web pages: built with `-DRAVEN_BUILD_WEB=OFF`, `registerWebView` and `webFunctions()` throw a `RavenError`.

```tsx
/** Whether web pages can be shown, known once `setup` ran. */
let pages = false;

function App(): ReactNode {
	return pages ? <WebView Url="https://example.com" Slot={{ Fill: 1 }} /> : <Label>No browser to show the page in</Label>;
}

await runApp(<App />, { Width: 800, Height: 600 }, {
	setup: () => {
		try {
			registerWebView();
			pages = webFunctions().Rweb_is_available() !== 0;
		} catch {
			// (a library without web pages)
		}
	},
});
```

The data of a few widgets is given as props. Rows of a `TreeView` have new handles each time `Items` changes. `Markup` holds the elements XML takes inside a widget, and a change to it makes the widget again:

```tsx
<TreeView Items={[{ Text: "World", Expanded: true, Children: [{ Text: "Sky" }] }]} />
<Timeline Markup={`<Track Name="Camera"><Clip Start="0" Length="3"/></Track>`} />
<Image Texture={raven.Rtexture_create_from_pixels(pixels, width, height)} />
```

A `Plot` takes its curves in `Series` and the lines the user drags in `DragLines`. The numbers are lists or `Float64Array`s, handed to Raven as they are: a new render sends only what changed, and a new array is what says that values changed. Streaming a million points with `Rplot_add_point` works too: leave `Y` out of that series.

```tsx
<Plot
	Title="Signal" XLabel="t (s)" Legend="TopLeft" YScale="SymLog"
	Series={[{ Name: "wave", X: times, Y: values, Marker: "Circle" }, { Name: "mean", Y: means, Color: "#E5484D", Line: "Dashed" }]}
	DragLines={[{ Axis: "Y", Value: limit, Label: "limit" }]}
	OnChanged={(_line, value) => setLimit(value)}
	OnViewChanged={(view) => console.log(view.X)}
/>
```

A `ref` gives a `WidgetInstance`, and `raven` is all of Raven's C API. Read `.widget` when you need it: the handle changes if the widget is made again.

```tsx
const input = useRef<WidgetInstance>(null);
useEffect(() => input.current?.focus(), []);
<TextInput ref={input} />

// a TreeView is filled this way
raven.Rtree_view_add_item(tree.current.widget, raven.R_INVALID_ID, "World");
```

A `Custom` draws with the `Rdraw_` functions. `OnPaint` runs while a frame is drawn, so it must not change state.

```tsx
<Custom
	OnMeasure={() => ({ Width: 400, Height: 200 })}
	OnPaint={(painter, width, height) => raven.Rdraw_rect(painter, 0, 0, width, height, 8, 0.2, 0.3, 0.4, 1)}
/>
```

Long lists ask for their rows as they are shown, and a million rows cost nothing:

```tsx
<ListView ItemCount={1_000_000} ItemText={(index) => `Row ${index}`} />
<TileView ItemCount={200} ItemFill={(index, item) => { item.text = names[index]; }} />
<Table Columns={["Name", "Age"]} RowCount={people.length} CellText={(row, column) => cell(people[row], column)} />
```

The color of the text of a row or a cell is asked for in the same way, as they are drawn, stored items or not: `#RRGGBB` or `#RRGGBBAA`, or nothing for the theme's. It runs while the frame is drawn, so it reads state and changes none.

```tsx
<ListView Items={files} ItemColor={(index) => (files[index]?.endsWith(".tmp") ? "#888888" : null)} />
<Table Columns={["Name", "Balance"]} RowCount={rows.length} CellText={text} CellColor={(row, column) => (column === 1 && rows[row].balance < 0 ? "#D33A2C" : null)} />
```

A `NodeGraph` and a `Timeline` take one of Raven's looks, `Preset` "Auto" (the theme), "Modern", "Blueprint", "Blender" or "Neon", and their parts can be changed one by one: `LinkShape`, `PinShape`, `HeaderStyle`, `ClipStyle`, `KeyShape`, `PlayheadColor`... One type of pin, one node or one track takes its own with `Rnode_graph_set_type_style`, `Rnode_graph_set_node_style` and `Rtimeline_set_track_style`.

```tsx
<NodeGraph Preset="Blueprint" LinkShape="Step" />
<Timeline Preset={look} ClipStyle="Outline" />
```

Some things are done through a `ref`, as they are actions and not state. A `Toast` shows one message at a time; with `Queue="Sequence"` the next one waits its turn, with `Queue="Stack"` up to `MaxVisible` show at once.

```tsx
raven.Rtoast_show(toast.current.widget, "Saved", 3);
raven.Rnotification_show("Backup", "It is finished", raven.R_NOTIFICATION_NORMAL);
```

What belongs to the system and not to a window has no component: an icon in the tray (`Rtray_create`, `Rtray_set_menu`, `Rtray_set_clicked_callback`), the badge, progress and menu of the taskbar or the Dock (`Rtaskbar_set_badge`, `Rwindow_set_taskbar_progress`), picture in picture (`Rwindow_set_picture_in_picture`), and the inspector of a window, which lists its widgets and picks one with a click (`Rwindow_set_inspector`). Call them from an effect, and undo them in its cleanup.

An application with a tray icon lives on when its last window closes, as a tray application should: `runApp` returns only after `raven.Rquit(0)`, or the action `app.quit`. Give the icon a way to end it, a "Quit" item of its menu for one; the cleanup that destroys the icon still runs then. Make it only where the system shows it, `Rtray_is_supported()`: on Linux an icon is made even when no panel runs to show it, and the application would live on with nothing to click. Without one, closing the last window ends it, as usual.

```tsx
useEffect(() => {
	// (on Linux, a panel that shows tray icons must be running)
	const tray = raven.Rtray_is_supported() ? raven.Rtray_create() : raven.R_INVALID_ID;
	if (tray === raven.R_INVALID_ID) {
		return; // (no tray: the application ends with its last window)
	}
	// Its picture, as RGBA pixels: without one, some panels show nothing to click.
	// An orange square here; in practice, the icon of the application.
	const pixels = new Uint8Array(32 * 32 * 4);
	for (let index = 0; index < pixels.length; index += 4) {
		pixels.set([0xe8, 0x59, 0x0c, 0xff], index);
	}
	raven.Rtray_set_icon(tray, pixels, 32, 32);
	raven.Rtray_set_tooltip(tray, "Backup");
	raven.Rtray_set_clicked_callback(tray, () => raven.Rquit(0));
	return () => raven.Rtray_destroy(tray);
}, []);
```

An `Image` shows an SVG file like any other: `<Image Source="logo.svg" />`.

## The device

The services of the device are functions of the core, exported by each adapter too, with promises: permissions, the pickers and the camera of the system, the share sheet, haptics. On a phone they show a screen of the system while the application runs on. On a desktop the pickers are Raven's file dialogs, and the camera and the share sheet answer `"unsupported"`, as do the permissions, but for notifications.

```tsx
import { openFiles, requestPermission, saveFile, share, takePhoto } from "@decky.fx/raven-tsx/react";

const { result, files } = await openFiles({ filters: [{ name: "Images", patterns: "*.png;*.jpg" }], multiple: true });
if (result === "done") {
	for (const file of files) console.log(file.path, file.name, file.size);
}
await saveFile(JSON.stringify(data), { fileName: "data.json", window: main.current });
const status = await requestPermission("camera"); // "granted", "denied", "blocked", "unsupported"...
```

| Function | Answer |
|---|---|
| `requestPermission(name)` | the status, once the user answered: `"unsupported"`, `"not-asked"`, `"granted"`, `"limited"`, `"denied"` or `"blocked"` |
| `openFiles(options)`, `pickPhotos(max)`, `takePhoto()` | `{ result, files }` |
| `saveFile(data, options)`, `exportFile(path, options)`, `selectFolder(options)` | `{ result, files }`: the file saved, or the folder |
| `share({ text, path, mimeType, title, anchor })` | `{ result, files: [] }` |

`result` is `"done"`, `"cancelled"`, `"denied"` (a permission it needs was refused), `"unsupported"`, `"busy"` (another screen of the system is open: one at a time) or `"failed"`, and `files` holds something only when it is `"done"`: a `path` Raven and the file system can read (on iOS and Android a copy in the cache), the `name` the user saw, `mimeType`, `size`, and `width` and `height` of a photo. `options` of a picker are `window` (a handle or the ref of a `<Window>`), `title`, `directory`, `fileName`, `filters`, `defaultExtension` and `multiple`, each optional.

Each answer comes once, at a later frame, never inside the call, and what awaits it runs as after a timer. A request needs Raven running, and throws a `RavenError` otherwise: one still open when Raven stops is never answered, as in C. Nothing is made for each request: one native callback serves them all.

What answers at once is a plain function: `getPermission(name)` (the status, without asking), `openSettings()` (the page of the application in the Settings of the system), `isCameraAvailable()`, `isHapticSupported()`, `haptic("light" | "medium" | "heavy" | "selection" | "success" | "warning" | "error")`, `openUrl(url)` and `clipboardHasText()`, the last four with whether it happened. `watchPermission(name, handler)` calls the function with the status now and at each change, as when the user changed it in the Settings while the application was away (it reads it twice a second), and returns what stops it.

`usePermission(name)` of React, and `createPermission(name)` of Solid, are that as state: the status, and the function that asks.

```tsx
function Camera(): ReactNode {
	const [camera, askCamera] = usePermission("camera");
	return camera === "granted" ? <Button OnClicked={() => void takePhoto().then(show)}>Take a photo</Button>
		: camera === "blocked" ? <Button OnClicked={openSettings}>Allow the camera in Settings</Button>
		: <Button OnClicked={() => void askCamera()}>Use the camera</Button>;
}
```

They work on Bun and on Node.js alike. What a phone application declares for each (its manifest, its Info.plist) is listed in Raven's `include/raven/raven_device.h`.

## What to expect

- Removing a prop makes the widget again, in its place, with the same children: Raven has no way to give an attribute its default back. What the widget held by itself (focus, typed text, scrolling) is lost. To avoid that, keep the prop and change its value.
- The designer of Raven does not edit TSX.
- Style parts and states (`Part`, `State`) only exist in themes: `Styles` of `defineTheme`, not props.

## Working on this package

The repository is a Bun workspace, with this package in `packages/raven-tsx` and the examples in `examples`: `helloworld` tries everything, `solid-helloworld` is the same with Solid, the others are the examples of Raven in TSX. It expects a Raven checkout two folders up, at `../../raven` from the root:

    raven/                 github.com/oscar-soirey/Raven
    bun/raven-tsx/         this repository

Check out the commit of Raven this package is pinned to, build it, then make the native package of your platform from it (`native:local` refuses a library built from any other commit):

    git -C raven checkout "$(cat bun/raven-tsx/packages/raven-tsx/RAVEN_VERSION)"
    cmake -S raven -B raven/build-shared -DCMAKE_BUILD_TYPE=Release -DRAVEN_BUILD_SHARED=ON
    cmake --build raven/build-shared --parallel
    cd bun/raven-tsx/packages/raven-tsx
    bun run native:local
    bun install
    bun test

Then, in `examples/helloworld`: `bun run dev`, or `bun run build`. Every other example runs with `bun run dev` in its folder.

| Task | Command |
|---|---|
| Regenerate `src/core/props.generated.ts` and `src/react/components.generated.ts` | `bun run generate` |
| Cross-build `raven.dll` on Linux with MinGW-w64, then `bun install` | `bun run native:windows` |
| Compile a Windows `.exe` of the example, after that | `bun run build:windows` in `examples/helloworld` |
| Where things stand, and what changed in Raven's API | `bun run raven:status [ref]` |
| Check that everything agrees with the pin | `bun run raven:check` |
| Move to another Raven, or to the latest | `bun run raven:update [ref]` |

With a checkout that others build in too, `--raven-build <folder>` and `--node-build <folder>` (of `native:local` and `raven:update`) say where the library and the addon of Node.js are built, in place of its `build-shared` and `build-node`.

`RAVEN_VERSION` says which Raven this is, a full commit or a tag, and nothing else does. `raven:update` is the way to change it: it moves the checkout, builds the libraries, packages one, and only then takes the binding, writes the pin and generates the components, since a newer library works with an older binding and the opposite stops every application at startup. It stops at the first step that fails, and can be run again.

Nothing in a library says which commit it is: `Rget_version` is the same for every commit between two releases. So `native:local` asks CMake which checkout the build folder belongs to, refuses it unless that checkout is at the pin with no changes, brings the build up to date, and writes `raven.json` beside the library. `--allow-mismatch` packages a library to try a change, and `raven:check` then says so. An application started with a library that lacks what the binding needs says so too, rather than naming one symbol.

`src/test/core/coverage.test.ts` fails when Raven adds a tag, an attribute or a callback nobody has decided about: wire it, or say there why not.

### Drift

`drift.txt` records the git blob of each Raven file that raven-tsx copies or mirrors: the examples, `src/widgets`, `src/widget` and `src/xml`. It catches what an API diff cannot, such as a widget that behaves differently or an example that gained a feature.

| Task | Command |
|---|---|
| What differs from `drift.txt` at the pin | `bun run raven:drift` |
| Preview another commit before moving to it | `bun run raven:drift upstream/main` |
| The same, failing if anything differs | `bun run raven:drift --check` |
| Record a file or folder as checked, at the pin | `bun run raven:drift --accept examples/music` |
| Record everything as checked, at the pin | `bun run raven:drift --accept-all` |

`raven:status` and `raven:check` include it. A changed file is listed as `old..new`, and `git diff old new` in the Raven checkout shows the change. Accept a file only after you have looked at it: the diff of `drift.txt` in a commit is the record of what was reviewed.

Every push builds Raven at `RAVEN_VERSION` on each platform, and runs `raven:check` and the tests there.

Publishing is off until the repository variable `NPM_PUBLISH` is `true`; until then the workflow rehearses it with `npm pack --dry-run`. A new version is: set `version` in `package.json`, and push the tag `v<version>`. The packages of the platforms are published first, then this one.

Each of the 6 packages publishes through its trusted publisher on npm, with OIDC and provenance, and no token: repository `deckyfx/raven-tsx`, workflow `release.yml`, environment `npm`, with publishing allowed (by default it may only stage). A package added later needs one too before its first tag. npm can only trust a workflow for a package that exists, so publish a placeholder version of it by hand first, lower than the tag (`0.0.0`): the workflow skips a version npm already has, and the first tag must publish a new one, which also validates the publisher. A new trusted publisher expires unless it publishes within 2 days: make it just before the tag, and if it expired, delete it and make another. Limit the GitHub environment `npm` to `v*` tags, so that a run of a branch cannot publish.
