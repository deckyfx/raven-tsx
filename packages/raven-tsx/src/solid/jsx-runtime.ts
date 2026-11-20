/**
 * The types of JSX for Solid on Raven, which solid-js 2 leaves to its renderers (its DOM's are in
 * `@solidjs/web`, which an application of Raven does not have). An application names it in its
 * tsconfig.json; the plugin compiles the JSX, so nothing of this is imported when it runs:
 *
 *     "jsx": "preserve",
 *     "jsxImportSource": "@decky.fx/raven-tsx/solid"
 */

import type { Element as SolidElement } from "solid-js";

/** What TypeScript checks JSX with. */
export declare namespace JSX {
	/** What a component returns, and a child is: a node of the renderer, a text, a list of them, or nothing. */
	type Element = SolidElement;

	/** The prop that holds the children of an element. */
	interface ElementChildrenAttribute {
		// (only its name counts)
		children: {};
	}

	/** No tag of its own: a widget is a component of this package, with a capitalized name. */
	interface IntrinsicElements {}
}
