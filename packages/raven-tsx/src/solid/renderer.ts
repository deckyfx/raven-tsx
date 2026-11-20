/**
 * Solid's renderer for Raven: what TSX compiled for Solid calls (`createElement`, `insert`,
 * `spread`...). The plugin of `@decky.fx/raven-tsx/solid/plugin` compiles it to import from here;
 * an application imports `@decky.fx/raven-tsx/solid`.
 */

import { createRenderer } from "@solidjs/universal";
import { flush } from "solid-js";
import { eventScope } from "../core/events";
import { SolidNode } from "./node";

// (Solid applies writes at the next microtask: what a handler of a native event wrote is applied
// before the event ends, so that a controlled widget is put back to what the props say, and the
// next event reads it, as under React. Writes from elsewhere, a timer, a frame, wait for the microtask)
eventScope.addFlush(() => flush());

export const {
	render,
	effect,
	memo,
	createComponent,
	createElement,
	createTextNode,
	insertNode,
	insert,
	spread,
	setProp,
	mergeProps,
	applyRef,
	ref,
} = createRenderer<SolidNode>({
	// (the props a tag has as written, `<raw Name="x">`: the widget is made with them)
	createElement: (tag, staticProps) => SolidNode.element(tag, staticProps),
	createTextNode: (value) => SolidNode.text(value),
	replaceText: (node, value) => node.setText(value),
	isTextNode: (node) => node.isText,
	// (the props are kept on the node: the value before is not needed)
	setProperty: (node, name, value) => node.setProp(name, value),
	insertNode: (parent, node, anchor) => parent.insert(node, anchor ?? null),
	removeNode: (parent, node) => parent.release(node),
	getParentNode: (node) => node.parent ?? undefined,
	getFirstChild: (node) => node.children[0],
	getNextSibling(node) {
		const siblings = node.parent?.children ?? [];
		return siblings[siblings.indexOf(node) + 1];
	},
});
