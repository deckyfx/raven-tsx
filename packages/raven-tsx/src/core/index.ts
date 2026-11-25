/**
 * raven-tsx: Raven's widgets from TSX. This is the core, which knows only Raven and is what the
 * adapters are made on: an application writes its components with one (`@decky.fx/raven-tsx/react`,
 * which also exports everything here), and imports this for code that is not a component:
 *
 *     import { defineTheme, loadTheme, raven } from "@decky.fx/raven-tsx";
 *
 * The services of the device (`openFiles`, `requestPermission`, `share`...) are here too, as
 * promises: they are not components.
 *
 * What an adapter needs beyond this (`finishPlacing`, `registerTagWith`, `WidgetInstance`...) is in
 * the modules of this folder: it is for this package, not for applications.
 */

export type * from "./props.generated";
export {
	clipboardHasText, exportFile, getPermission, haptic, isCameraAvailable, isHapticSupported, openFiles, openSettings, openUrl, pickPhotos,
	requestPermission, saveFile, selectFolder, share, takePhoto, watchPermission,
	type DeviceAnswer, type DeviceResult, type FileFilter, type FileOptions, type Haptic, type Permission, type PermissionStatus, type PickedFile, type ShareOptions,
} from "./device";
export { RavenError } from "./errors";
export { inEventScope, type MeasuredSize, type Painter, type PlotView, type SystemWebViewEvent } from "./events";
export type { FrameHandler } from "./frame";
export type { AttributeGroup, AttributeValue, EventHandler, PlotDragLine, PlotNumbers, PlotSeries, TreeItem } from "./props";
export { onAction, onFrame, onShortcut, parseKeys } from "./subscriptions";
export type { AttributeKind } from "./tags";
export type { WidgetInstance } from "./widget-instance";
export type { WindowInstance } from "./window-instance";
/** All of Raven's C API, for what props do not cover: painting, for one. */
export * as raven from "./raven";
export { registerWebView, webFunctions, type WebViewProps } from "./web";
export {
	defineTheme, loadTheme, themeXml,
	type GlassProperty, type LookName, type PartProperties, type PartShape, type SyntaxToken, type ThemeColor, type ThemeColors,
	type ThemeMetrics, type ThemePart, type ThemeSpec, type ThemeState, type ThemeStyle,
} from "./theme";
