/**
 * A small dashboard made of Chart widgets: KPI tiles with sparklines, a pie, a donut with its
 * total in the middle, two gauges with bands, and a heatmap of the orders by weekday and hour.
 * The port of `examples/charts` of Raven.
 *
 *   props     the sparklines (`Values`), the gauges (`Value`), the selected slice (`Selected`),
 *             the title of the heatmap and the theme: all of it is React state
 *   Markup    the slices and the bands, which never change their number: a new Markup would
 *             make the chart again, so it is given once
 *   a ref     the values of the slices on "Shuffle" (`Rchart_set_slice_value`, so they glide to
 *             their place) and the cells of the heatmap (`Rchart_set_grid`): no prop takes them
 *
 * The pointer over a slice lifts it and tells its value and share; over a cell of the heatmap
 * or a point of a sparkline, its value. A click on a slice selects it; a click on a cell writes
 * it under the title.
 *
 * Two differences with the original. A sparkline gets its 30 values again each second through
 * `Values`, where C pushes one with `Rchart_push_value`: as many values glide to their new place,
 * so the line slides along where C steps it. The middle of the donut tells its total as it is
 * after a shuffle, where C keeps the "10.8k" it was given at the start.
 *
 * As the C example, it reads RAVEN_EXAMPLE_THEME=light (to start in the light theme) and
 * RAVEN_EXAMPLE_POINT=x,y (the pointer put there, in window coordinates, once the window is shown).
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
	Border, Button, Chart, Checkbox, HBox, Label, raven, runApp, UniformGrid, useFrame, VBox,
	type WidgetInstance,
} from "@decky.fx/raven-tsx/react";

const DAYS = 7;
const HOURS = 24;
const SPARK_DAYS = 30;

const START_LIGHT = process.env.RAVEN_EXAMPLE_THEME === "light";

/** Where RAVEN_EXAMPLE_POINT puts the pointer, or null. */
const POINT = ((): readonly [number, number] | null => {
	const [x, y] = (process.env.RAVEN_EXAMPLE_POINT ?? "").split(",").map(Number);
	return x !== undefined && y !== undefined && Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
})();

let seed = 2026;

/** A small random number generator, from -0.5 to 0.5: the same data at every run. */
function noise(): number {
	seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
	return (seed >>> 8) / 16777216 - 0.5;
}

/** Orders in an hour of a weekday: a morning and an evening peak, quieter weekends, a little noise. */
function ordersAt(day: number, hour: number): number {
	const weekend = day >= 5 ? 0.65 : 1;
	const morning = Math.exp(-(((hour - 11) / 2.6) ** 2));
	const evening = Math.exp(-(((hour - 20) / 2.2) ** 2)) * (day >= 4 ? 1.35 : 1);
	const night = hour < 6 ? 0.15 : 0.35;
	return Math.floor((night + morning * 1.6 + evening * 1.2) * 38 * weekend * (1 + noise() * 0.35));
}

/** The cells of the heatmap, row after row (a day is a row). */
function activity(): number[] {
	return Array.from({ length: DAYS * HOURS }, (_, i) => ordersAt(Math.floor(i / HOURS), i % HOURS));
}

// (made first, as C fills the heatmap first: the same cells as the original)
const FIRST_ACTIVITY = activity();

/** A slice of a pie or a donut. */
interface Slice {
	readonly label: string;
	readonly value: number;
}

const TRAFFIC: readonly Slice[] = [
	{ label: "Organic search", value: 18420 },
	{ label: "Direct", value: 10530 },
	{ label: "Referral", value: 6580 },
	{ label: "Social", value: 4830 },
	{ label: "Email", value: 3510 },
];

const BROWSERS: readonly Slice[] = [
	{ label: "Chrome", value: 6420 },
	{ label: "Safari", value: 2310 },
	{ label: "Firefox", value: 980 },
	{ label: "Edge", value: 760 },
	{ label: "Other", value: 330 },
];

/** The `<Slice>` elements of a pie or a donut. */
function slicesMarkup(slices: readonly Slice[]): string {
	return slices.map(({ label, value }) => `<Slice Label="${label}" Value="${value}"/>`).join("");
}

/** The `<Band>` elements of a gauge (no color: those of the theme, success, warning, danger). */
function bandsMarkup(bands: readonly (readonly [number, number])[]): string {
	return bands.map(([from, to]) => `<Band From="${from}" To="${to}"/>`).join("");
}

const CPU_BANDS = bandsMarkup([[0, 60], [60, 85], [85, 100]]);
const MEMORY_BANDS = bandsMarkup([[0, 20], [20, 28], [28, 32]]);

/** A KPI tile: its name, its number, its change, and the sparkline of the last 30 days. */
interface Kpi {
	readonly name: string;
	readonly text: string;
	readonly change: string;
	/** The color of the change: green when it is good news. */
	readonly changeColor: string;
	/** How far a new value of the sparkline goes from the last one. */
	readonly spread: number;
	readonly color?: string;
	readonly format?: string;
	readonly fill?: boolean;
	readonly values: readonly number[];
}

const GOOD = "#22C55E";
const BAD = "#F43F5E";

const KPIS: readonly Kpi[] = [
	{
		name: "Revenue", text: "$48.2k", change: "+12.4%", changeColor: GOOD, spread: 2, format: "$%.1fk",
		values: [31, 33, 32, 35, 34, 36, 38, 37, 36, 39, 41, 40, 42, 41, 43, 45, 44, 43, 46, 45, 44, 47, 46, 48, 47, 46, 48, 49, 47, 48.2],
	},
	{
		name: "Active users", text: "3,214", change: "+5.1%", changeColor: GOOD, spread: 60, color: "#14B8A6",
		values: [2710, 2790, 2750, 2880, 2930, 2860, 2990, 3050, 2980, 3010, 3100, 3060, 2990, 3080, 3120, 3070, 3150, 3110, 3180, 3140, 3090, 3160, 3200, 3170, 3130, 3190, 3230, 3180, 3200, 3214],
	},
	{
		name: "Orders", text: "1,082", change: "-2.3%", changeColor: BAD, spread: 30, color: "#F43F5E",
		values: [1180, 1160, 1190, 1150, 1170, 1140, 1160, 1130, 1150, 1120, 1140, 1110, 1135, 1120, 1100, 1125, 1110, 1090, 1115, 1100, 1080, 1105, 1095, 1070, 1090, 1100, 1075, 1085, 1090, 1082],
	},
	{
		// (a shorter response time is good news: its fall is green)
		name: "Response time", text: "182 ms", change: "-8.0%", changeColor: GOOD, spread: 14, color: "#F59E0B", format: "%.0f ms", fill: false,
		values: [214, 208, 221, 203, 199, 210, 196, 205, 192, 201, 188, 197, 190, 185, 194, 187, 181, 190, 184, 179, 186, 183, 177, 185, 180, 176, 183, 179, 185, 182],
	},
];

/** What moves every second. */
interface Live {
	readonly sparks: readonly (readonly number[])[];
	readonly cpu: number;
	readonly memory: number;
}

/**
 * The next second: a value near the last one at the end of each sparkline (the oldest goes), and
 * the gauges move. `draws` are six values of `noise()`, drawn before (an updater of React stays pure).
 */
function nextSecond(live: Live, draws: readonly number[]): Live {
	const draw = (i: number): number => draws[i] ?? 0;
	const sparks = live.sparks.map((values, i) => {
		const last = values[values.length - 1] ?? 0;
		return [...values, last + draw(i) * (KPIS[i]?.spread ?? 0)].slice(-SPARK_DAYS);
	});
	const cpu = Math.min(100, Math.max(0, live.cpu + draw(4) * 30));
	const memory = Math.min(32, Math.max(8, live.memory + draw(5) * 4));
	return { sparks, cpu, memory };
}

/** New shares: every value moves by up to 40%. */
function shuffled(values: readonly number[]): number[] {
	return values.map((value) => Math.floor(value * (1 + noise() * 0.8)));
}

/** A total written short: 10800 is "10.8k". */
function short(total: number): string {
	return total >= 1000 ? `${(total / 1000).toFixed(1)}k` : `${total}`;
}

/** Gives a pie or a donut its values, which glide there. Its slices come from Markup, so no prop takes them. */
function useSliceValues(chart: RefObject<WidgetInstance | null>, values: readonly number[]): void {
	useEffect(() => {
		const widget = chart.current?.widget;
		if (widget !== undefined) {
			values.forEach((value, i) => raven.Rchart_set_slice_value(widget, i, value));
		}
	}, [chart, values]);
}

/** A rounded panel, as all the parts of the dashboard. */
function Panel({ padding, fill, children }: { readonly padding: string | number; readonly fill?: boolean; readonly children: ReactNode }): ReactNode {
	return (
		<Border CornerRadius={14} Padding={padding} Slot={fill ? { Fill: 1 } : undefined}>
			{children}
		</Border>
	);
}

/** A KPI tile and its sparkline. */
function KpiTile({ kpi, values }: { readonly kpi: Kpi; readonly values: readonly number[] }): ReactNode {
	return (
		<Panel padding="18,16">
			<VBox Spacing={6}>
				<Label Opacity={0.65}>{kpi.name}</Label>
				<HBox Spacing={10}>
					<Label TextSize={26} Slot={{ VAlign: "Bottom" }}>{kpi.text}</Label>
					<Label Color={kpi.changeColor} Slot={{ VAlign: "Center" }}>{kpi.change}</Label>
				</HBox>
				<Chart Kind="Sparkline" Height={46} Color={kpi.color} Format={kpi.format} Fill={kpi.fill} Values={values} />
			</VBox>
		</Panel>
	);
}

/** Says in the terminal which slice was clicked, as C does. */
function tellSlice(title: string, slices: readonly Slice[], slice: number, selected: boolean): void {
	console.log(`${title}: ${slices[slice]?.label ?? slice} ${selected ? "selected" : "unselected"}`);
}

/** The whole window. */
function App(): ReactNode {
	const [dark, setDark] = useState(!START_LIGHT);
	const [live, setLive] = useState(true);
	const [data, setData] = useState<Live>(() => ({ sparks: KPIS.map((kpi) => kpi.values), cpu: 64, memory: 27.5 }));
	const [traffic, setTraffic] = useState<readonly number[]>(() => TRAFFIC.map((slice) => slice.value));
	const [browsers, setBrowsers] = useState<readonly number[]>(() => BROWSERS.map((slice) => slice.value));
	const [cells, setCells] = useState<readonly number[]>(FIRST_ACTIVITY);
	const [trafficSelected, setTrafficSelected] = useState(-1);
	const [browsersSelected, setBrowsersSelected] = useState(0);
	const [cell, setCell] = useState("");
	const trafficChart = useRef<WidgetInstance>(null);
	const browsersChart = useRef<WidgetInstance>(null);
	const activityChart = useRef<WidgetInstance>(null);

	useEffect(() => {
		raven.Rtheme_apply(dark ? raven.R_THEME_DARK : raven.R_THEME_LIGHT);
	}, [dark]);

	// the data moves every second, while "Live" is on
	useEffect(() => {
		if (!live) {
			return undefined;
		}
		const timer = setInterval(() => {
			// (drawn in the order of C: the four sparklines, the CPU, the memory)
			const draws = Array.from({ length: 6 }, noise);
			setData((current) => nextSecond(current, draws));
		}, 1000);
		return () => clearInterval(timer);
	}, [live]);

	useSliceValues(trafficChart, traffic);
	useSliceValues(browsersChart, browsers);

	// (the same size as before: the cells glide to their new values)
	useEffect(() => {
		const widget = activityChart.current?.widget;
		if (widget !== undefined) {
			raven.Rchart_set_grid(widget, DAYS, HOURS, cells);
		}
	}, [cells]);

	// (for the pictures: the pointer put where RAVEN_EXAMPLE_POINT says, once the layout is done)
	const frames = useRef(0);
	useFrame(() => {
		const widget = activityChart.current?.widget;
		if (POINT && widget !== undefined && ++frames.current === 3) {
			raven.Rwindow_inject_mouse_move(raven.Rwidget_get_window(widget), POINT[0], POINT[1]);
		}
	});

	/** New shares for the pie and the donut, and new cells for the heatmap. */
	const shuffle = (): void => {
		setTraffic(shuffled(traffic));
		setBrowsers(shuffled(browsers));
		setCells(activity());
	};

	const total = browsers.reduce((sum, value) => sum + value, 0);

	return (
		<VBox Spacing={16} Slot={{ Padding: 24 }}>
			<HBox Spacing={12}>
				<VBox Spacing={2} Slot={{ Fill: 1 }}>
					<Label TextSize={26}>Store dashboard</Label>
					<Label Opacity={0.6}>Point at a slice, a cell or a sparkline for its value  -  click a slice to select it  -  the data moves every second</Label>
				</VBox>
				<Checkbox Style="Switch" Checked={dark} OnChanged={setDark} Slot={{ VAlign: "Center" }}>Dark</Checkbox>
				<Checkbox Style="Switch" Checked={live} OnChanged={setLive} Slot={{ VAlign: "Center" }}>Live</Checkbox>
				<Button Style="Primary" OnClicked={shuffle} Slot={{ VAlign: "Center" }}>Shuffle</Button>
			</HBox>

			{/* 1. KPI tiles: a number, its change, and a sparkline of the last 30 days */}
			<UniformGrid Columns={4} Spacing={16}>
				{KPIS.map((kpi, i) => <KpiTile key={kpi.name} kpi={kpi} values={data.sparks[i] ?? kpi.values} />)}
			</UniformGrid>

			{/* 2. Shares and levels */}
			<HBox Spacing={16} Height={276}>
				<Panel padding={18} fill>
					<Chart
						ref={trafficChart}
						Kind="Pie"
						Title="Visits by source"
						Markup={slicesMarkup(TRAFFIC)}
						Selected={trafficSelected}
						OnSliceClicked={(slice, selected) => {
							tellSlice("Visits by source", TRAFFIC, slice, selected);
							setTrafficSelected(selected ? slice : -1);
						}}
					/>
				</Panel>
				<Panel padding={18} fill>
					<Chart
						ref={browsersChart}
						Kind="Donut"
						Title="Sessions by browser"
						// (the total in the middle of the donut, written short)
						CenterText={short(total)}
						CenterCaption="sessions"
						Markup={slicesMarkup(BROWSERS)}
						Selected={browsersSelected}
						OnSliceClicked={(slice, selected) => {
							tellSlice("Sessions by browser", BROWSERS, slice, selected);
							setBrowsersSelected(selected ? slice : -1);
						}}
					/>
				</Panel>
				<Panel padding={18} fill>
					<VBox Spacing={4}>
						<Label Opacity={0.9}>Servers</Label>
						<HBox Spacing={8} Slot={{ Fill: 1 }}>
							<Chart Kind="Gauge" Title="CPU" Min={0} Max={100} Value={data.cpu} Format="%.0f%%" Markup={CPU_BANDS} Slot={{ Fill: 1 }} />
							<Chart Kind="Gauge" Title="Memory" Min={0} Max={32} Value={data.memory} Format="%.1f GB" Markup={MEMORY_BANDS} Slot={{ Fill: 1 }} />
						</HBox>
					</VBox>
				</Panel>
			</HBox>

			{/* 3. When the customers come: orders by weekday and hour */}
			<Panel padding={18} fill>
				<Chart
					ref={activityChart}
					Kind="Heatmap"
					Title={`Orders by weekday and hour${cell}`}
					Format="%.0f orders"
					RowLabels={["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]}
					ColumnLabels={Array.from({ length: HOURS }, (_, hour) => `${String(hour).padStart(2, "0")}h`)}
					OnCellClicked={(row, column, value) => {
						const widget = activityChart.current?.widget;
						const day = widget === undefined ? row : raven.Rchart_get_row_label(widget, row);
						const hour = widget === undefined ? column : raven.Rchart_get_column_label(widget, column);
						setCell(`  -  ${day} ${hour}: ${value.toFixed(0)}`);
					}}
				/>
			</Panel>
		</VBox>
	);
}

await runApp(<App />, { Title: "Raven charts", Width: 1280, Height: 880 }, {
	appName: "Raven charts",
	setup: () => raven.Rtheme_apply(START_LIGHT ? raven.R_THEME_LIGHT : raven.R_THEME_DARK),
});
