/**
 * The icons shipped with Raven (`Ricon_get`), every one of them in a gallery, and some in buttons,
 * tabs and a tree, written `Source="raven:save"`. They are drawn in the color of the text around
 * them: the button at the top right switches between the dark and the light theme, and the icons
 * follow, as they follow hover, pressed and disabled. The port of `examples/icons` of Raven.
 *
 * The gallery is elements made from the names Raven gives (`Ricon_get_count`, `Ricon_get_name`),
 * where the original adds its widgets by hand. RAVEN_ICONS_LIGHT=1 starts in the light theme.
 */

import { useState, type ReactNode } from "react";
import { Button, HBox, Image, Label, raven, runApp, ScrollBox, TabView, TreeView, VBox, WrapBox } from "@decky.fx/raven-tsx/react";

/** An icon and its text, in a button. */
function IconText({ icon, text }: { icon: string; text: string }): ReactNode {
	return (
		<HBox Spacing={8}>
			<Image Source={`raven:${icon}`} Width={16} Height={16} Slot={{ VAlign: "Center" }} />
			<Label Text={text} Slot={{ VAlign: "Center" }} />
		</HBox>
	);
}

const TREE = `
	<Item Text="Project" Icon="raven:open" Expanded="true">
		<Item Text="README.md" Icon="raven:file"/>
		<Item Text="photo.png" Icon="raven:image"/>
		<Item Text="Settings" Icon="raven:settings"/>
	</Item>
	<Item Text="Starred" Icon="raven:star"/>
	<Item Text="Shared" Icon="raven:link"/>`;

function App(): ReactNode {
	// (Raven knows them once it started, which is before the first render)
	const [names] = useState(() => Array.from({ length: raven.Ricon_get_count() }, (_, index) => raven.Ricon_get_name(index) ?? "").filter(Boolean));
	const [light, setLight] = useState(process.env["RAVEN_ICONS_LIGHT"] !== undefined);

	const switchTheme = (): void => {
		raven.Rtheme_apply(light ? raven.R_THEME_DARK : raven.R_THEME_LIGHT);
		setLight(!light);
	};

	return (
		<VBox Spacing={14} Slot={{ Padding: 24 }}>
			<HBox Spacing={10}>
				<VBox Spacing={2} Slot={{ Fill: 1 }}>
					<Label Text="Icons" TextSize={26} />
					<Label Text="Shipped with Raven, drawn in the color of the text: they follow the theme, hover, pressed and disabled" Opacity={0.6} />
				</VBox>
				{/* (the button of the theme names the other one) */}
				<Button Name="theme" OnClicked={switchTheme} Slot={{ VAlign: "Center" }}>
					<IconText icon={light ? "moon" : "sun"} text={light ? "Dark" : "Light"} />
				</Button>
			</HBox>

			<HBox Spacing={10}>
				<Button Style="Primary"><IconText icon="save" text="Save" /></Button>
				<Button Name="hovered"><IconText icon="share" text="Share" /></Button>
				<Button Enabled={false}><IconText icon="delete" text="Delete (disabled)" /></Button>
				<Button Style="Flat"><Image Source="raven:settings" Width={18} Height={18} /></Button>
				<HBox Spacing={6} Slot={{ VAlign: "Center" }}>
					<Image Source="raven:warning" Width={16} Height={16} Tint="#F5A524" Slot={{ VAlign: "Center" }} />
					<Label Text="Tint gives an icon its own color" Slot={{ VAlign: "Center" }} />
				</HBox>
			</HBox>

			<HBox Spacing={14} Slot={{ Fill: 1 }}>
				<TabView Width={250} Documents>
					<TreeView Markup={TREE} Slot={{ Title: "Files", Icon: "raven:folder", Closable: false }} />
					<Label Text="Nothing to search." Slot={{ Title: "Search", Icon: "raven:search", Closable: false }} />
				</TabView>
				<ScrollBox Slot={{ Fill: 1 }}>
					<WrapBox Name="gallery" Spacing={6}>
						{/* one tile per icon: the icon, its name under it */}
						{names.map((name) => (
							<VBox key={name} Width={96} Height={64} Tooltip={name}>
								<Image Source={`raven:${name}`} Width={24} Height={24} Slot={{ Padding: [0, 8, 0, 6], HAlign: "Center" }} />
								<Label Text={name} TextSize={11} Opacity={0.7} Slot={{ HAlign: "Center" }} />
							</VBox>
						))}
					</WrapBox>
				</ScrollBox>
			</HBox>
		</VBox>
	);
}

await runApp(<App />, { Title: "Raven icons", Width: 960, Height: 640 }, {
	setup: () => raven.Rtheme_apply(process.env["RAVEN_ICONS_LIGHT"] !== undefined ? raven.R_THEME_LIGHT : raven.R_THEME_DARK),
});
