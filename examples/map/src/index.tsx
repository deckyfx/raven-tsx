/**
 * A MapView that works offline. The port of `examples/map` of Raven.
 *
 * Its tiles are drawn by the example itself, on worker threads, when the map asks for them in
 * `OnTile`: the sea and the land of a coarse outline of the world (`world.ts`) roughened by
 * noise, a graticule, and the z/x/y of each tile written in its corner, so that the tiling shows
 * (`terrain.ts`, `tiles.ts`). Markers for a few cities, given in `Markup`; a click on one flies
 * there. The buttons fly with `Rmap_view_animate_to` through a ref: the props `Latitude`,
 * `Longitude` and `Zoom` only jump.
 *
 *   bun run src/index.tsx
 *
 * RAVEN_MAP_TILE_DIR=/path/to/tiles reads real tiles from files instead ({z}/{x}/{y}.png under
 * that folder, as a tile cache or an extracted MBTiles keeps them; RAVEN_MAP_ATTRIBUTION gives
 * their credit). Nothing is ever fetched from the network.
 *
 * RAVEN_MAP_LAT, RAVEN_MAP_LON and RAVEN_MAP_ZOOM give the first view; RAVEN_MAP_DEMO=1 plays a
 * short tour (a drag, the wheel, a flight). The scripted runs of the common code of C's examples
 * (RAVEN_EXAMPLE_FRAMES, RAVEN_EXAMPLE_CAPTURE, RAVEN_EXAMPLE_FILM) are not ported, as in the
 * other ports.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, HBox, Label, MapView, raven, runApp, useFrame, VBox, type WidgetInstance } from "@decky.fx/raven-tsx/react";
import { TILE, World } from "./terrain";
import { TileWorkers } from "./tiles";

/** A marker of the map. */
interface Place {
	readonly label: string;
	readonly latitude: number;
	readonly longitude: number;
	readonly color?: string;
}

/** The markers, in the order of their ids (from 1). */
const PLACES: readonly Place[] = [
	{ label: "London", latitude: 51.5074, longitude: -0.1278 },
	{ label: "Paris", latitude: 48.8566, longitude: 2.3522 },
	{ label: "New York", latitude: 40.7128, longitude: -74.006 },
	{ label: "Los Angeles", latitude: 34.0522, longitude: -118.2437 },
	{ label: "Mexico City", latitude: 19.4326, longitude: -99.1332 },
	{ label: "Rio de Janeiro", latitude: -22.9068, longitude: -43.1729, color: "#2E9E5B" },
	{ label: "Buenos Aires", latitude: -34.6037, longitude: -58.3816 },
	{ label: "Cairo", latitude: 30.0444, longitude: 31.2357, color: "#D98E04" },
	{ label: "Lagos", latitude: 6.5244, longitude: 3.3792 },
	{ label: "Cape Town", latitude: -33.9249, longitude: 18.4241 },
	{ label: "Moscow", latitude: 55.7558, longitude: 37.6173 },
	{ label: "Mumbai", latitude: 19.076, longitude: 72.8777, color: "#D98E04" },
	{ label: "Beijing", latitude: 39.9042, longitude: 116.4074 },
	{ label: "Tokyo", latitude: 35.6762, longitude: 139.6503, color: "#D64545" },
	{ label: "Singapore", latitude: 1.3521, longitude: 103.8198 },
	{ label: "Sydney", latitude: -33.8688, longitude: 151.2093, color: "#2E9E5B" },
];

/** The <Marker> elements the map takes, made once: a new Markup would make the map again. */
const MARKUP = PLACES.map(({ label, latitude, longitude, color }) =>
	`<Marker Latitude="${latitude}" Longitude="${longitude}" Label="${label}"${color ? ` Color="${color}"` : ""}/>`,
).join("");

/** A number of the environment, or `fallback` when it is not set or not a number. */
function envNumber(name: string, fallback: number): number {
	const value = Number.parseFloat(Bun.env[name] ?? "");
	return Number.isFinite(value) ? value : fallback;
}

/** The first view: that of the original's map.xml, unless the environment says otherwise. */
const START = { latitude: envNumber("RAVEN_MAP_LAT", 25), longitude: envNumber("RAVEN_MAP_LON", 10), zoom: envNumber("RAVEN_MAP_ZOOM", 2) };
const TILE_DIR = Bun.env.RAVEN_MAP_TILE_DIR ?? "";
const DEMO = Bun.env.RAVEN_MAP_DEMO !== undefined;

/** The land, rasterized once before the window opens, as C does; the workers share it. */
const WORLD = World.build();

/** Where the map is, as the label at the top says it. */
function placeText(latitude: number, longitude: number, zoom: number): string {
	return `${Math.abs(latitude).toFixed(4)}° ${latitude < 0 ? "S" : "N"}   ${Math.abs(longitude).toFixed(4)}° ${longitude < 0 ? "W" : "E"}   zoom ${zoom.toFixed(2)}`;
}

/** The status line: the tiles asked for and cancelled, and the memory of those the map keeps. */
function statusText(tiles: TileWorkers, cacheBytes: number): string {
	return `tiles asked ${tiles.asked}   cancelled ${tiles.cancelled}   in memory ${(cacheBytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * RAVEN_MAP_DEMO: a short tour, by frames. It works the map as a user would, with the pointer
 * and the wheel injected into the window.
 */
function demoFrame(map: raven.Rid, frame: number): void {
	const window = raven.Rwidget_get_window(map);
	if (!raven.Rwindow_is_valid(window)) {
		return;
	}
	const [x, y, w, h] = raven.Rwidget_get_rect(map);
	if (frame === 40) {
		raven.Rmap_view_animate_to(map, 48, 6, 4);
	} else if (frame >= 130 && frame <= 160) {
		// a hand drags the map to the west, and lets it glide
		const t = frame - 130;
		if (frame === 130) {
			raven.Rwindow_inject_mouse_move(window, x + w * 0.6, y + h * 0.5);
			raven.Rwindow_inject_mouse_button(window, raven.R_MOUSE_LEFT, raven.R_TRUE);
		}
		raven.Rwindow_inject_mouse_move(window, x + w * 0.6 - t * 9, y + h * 0.5 + t * 2);
		if (frame === 160) {
			raven.Rwindow_inject_mouse_button(window, raven.R_MOUSE_LEFT, raven.R_FALSE);
		}
	} else if (frame === 220 || frame === 270) {
		// the wheel, over Paris
		const [px, py] = raven.Rmap_view_latlon_to_screen(map, 48.8566, 2.3522);
		raven.Rwindow_inject_mouse_move(window, x + px, y + py - 20);
		raven.Rwindow_inject_mouse_wheel(window, 0, 1);
	} else if (frame === 340) {
		raven.Rmap_view_animate_to(map, 41, -40, 3);
	} else if (frame === 420) {
		raven.Rmap_view_animate_to(map, 40.7128, -74.006, 5);
	}
}

function App(): ReactNode {
	const map = useRef<WidgetInstance>(null);
	const [tiles] = useState(() => new TileWorkers(WORLD, Math.max(1, raven.Rget_worker_thread_count()), (z, x, y, pixels) => {
		// (Raven copies the pixels: the buffer is drawn into again at once)
		const widget = map.current?.widget;
		if (widget !== undefined && raven.Rwidget_is_valid(widget)) {
			raven.Rmap_view_set_tile(widget, z, x, y, pixels, TILE, TILE);
		}
	}));
	const [place, setPlace] = useState(() => placeText(START.latitude, START.longitude, START.zoom));
	const [status, setStatus] = useState(() => statusText(tiles, 0));
	const frame = useRef(0);

	useEffect(() => () => tiles.dispose(), [tiles]);

	// the status line, four times a second
	useEffect(() => {
		const timer = setInterval(() => {
			const widget = map.current?.widget;
			setStatus(statusText(tiles, widget === undefined ? 0 : raven.Rmap_view_get_cache_usage(widget)));
		}, 250);
		return () => clearInterval(timer);
	}, [tiles]);

	useFrame(() => {
		const widget = map.current?.widget;
		if (DEMO && widget !== undefined) {
			demoFrame(widget, frame.current++);
		}
	});

	/** Glides to a place and a zoom. */
	const fly = (latitude: number, longitude: number, zoom: number): void => {
		const widget = map.current?.widget;
		if (widget !== undefined) {
			raven.Rmap_view_animate_to(widget, latitude, longitude, zoom);
		}
	};

	/** Glides one zoom level in (+1) or out (-1), to a whole level, where the map is. */
	const zoomBy = (direction: 1 | -1): void => {
		const widget = map.current?.widget;
		if (widget !== undefined) {
			const [latitude, longitude] = raven.Rmap_view_get_center(widget);
			const zoom = raven.Rmap_view_get_zoom(widget);
			raven.Rmap_view_animate_to(widget, latitude, longitude, direction > 0 ? Math.floor(zoom) + 1 : Math.ceil(zoom) - 1);
		}
	};

	/** A click on a marker flies there, at zoom 6 at least. */
	const flyToMarker = (marker: number): void => {
		const target = PLACES[marker - 1];
		const widget = map.current?.widget;
		if (target !== undefined && widget !== undefined) {
			fly(target.latitude, target.longitude, Math.max(6, raven.Rmap_view_get_zoom(widget)));
		}
	};

	return (
		<VBox>
			<HBox Spacing={8} Slot={{ Padding: "10,8,10,8" }}>
				<Button Style="Primary" OnClicked={() => fly(25, 10, 2)} Slot={{ VAlign: "Center" }}>World</Button>
				<Button OnClicked={() => fly(50, 10, 4)} Slot={{ VAlign: "Center" }}>Europe</Button>
				<Button OnClicked={() => fly(10, -80, 3)} Slot={{ VAlign: "Center" }}>Americas</Button>
				<Button OnClicked={() => fly(25, 110, 3)} Slot={{ VAlign: "Center" }}>Asia</Button>
				<Label Opacity={0.7} Slot={{ Fill: 1, HAlign: "Right", VAlign: "Center" }}>{place}</Label>
				<Button OnClicked={() => zoomBy(-1)} Slot={{ VAlign: "Center" }}>-</Button>
				<Button OnClicked={() => zoomBy(1)} Slot={{ VAlign: "Center" }}>+</Button>
			</HBox>
			<MapView
				ref={map}
				Latitude={START.latitude}
				Longitude={START.longitude}
				Zoom={START.zoom}
				MinZoom={1}
				MaxZoom={16}
				// real tiles from files: a tile cache, an extracted MBTiles (use {-y} for TMS rows)
				TilePath={TILE_DIR ? `${TILE_DIR}/{z}/{x}/{y}.png` : undefined}
				Attribution={TILE_DIR ? (Bun.env.RAVEN_MAP_ATTRIBUTION ?? "© OpenStreetMap contributors") : "Tiles drawn by the example (no network)"}
				Markup={MARKUP}
				OnTile={TILE_DIR ? undefined : tiles.request}
				OnTileCancelled={TILE_DIR ? undefined : tiles.cancel}
				OnChanged={(latitude, longitude, zoom) => setPlace(placeText(latitude, longitude, zoom))}
				OnMarkerClicked={flyToMarker}
				Slot={{ Fill: 1 }}
			/>
			<Label Opacity={0.6} Slot={{ Padding: "10,4,10,6" }}>{status}</Label>
		</VBox>
	);
}

await runApp(<App />, { Title: "Raven map", Width: 1100, Height: 720 }, { appName: "Raven map" });
