/** How a tag of Raven becomes a Solid component: what the generated components are made with. */

import { createRenderEffect, getOwner, omit, runWithOwner } from "solid-js";
import { WidgetInstance, type HostNode } from "../core/widget-instance";
import type { JSX } from "./jsx-runtime";
import { SolidNode } from "./node";
import { spread } from "./renderer";

/** What `ref` of a component is given: a function, as Solid compiles `ref={variable}` too, or a list of them. */
type RefOf<R> = R | ((instance: R) => void) | readonly RefOf<R>[];

/** The props every component has from Solid. */
export interface SolidProps<R> {
	/** Receives the widget (or the window) as React's `ref` does: `WidgetInstance`, `WindowInstance`. */
	readonly ref?: RefOf<R> | undefined;
	readonly children?: JSX.Element | undefined;
}

/** The functions of a `ref`: one, or those of a list, at any depth. A value is no function (`ref={variable}` is compiled to one). */
function refFunctions<R>(ref: RefOf<R> | undefined): ((instance: R) => void)[] {
	if (Array.isArray(ref)) {
		return (ref as readonly RefOf<R>[]).flatMap((each) => refFunctions(each));
	}
	return typeof ref === "function" ? [ref as (instance: R) => void] : [];
}

/**
 * A component for a tag of Raven, or one given to `Rxml_register_tag` with its props.
 * JSX takes a capitalized name for a component, not for a tag.
 */
export function tag<P extends object, R = WidgetInstance>(name: string): (props: P & SolidProps<R>) => JSX.Element {
	return (props) => {
		const node = SolidNode.element(name);
		// (the ref is this component's: the renderer would give it the node of Solid, not the widget)
		spread(node, omit(props as P & SolidProps<R>, "ref"));
		// (Solid compiles `ref={variable}` to a function that sets the variable. As React's, it comes
		// once Raven has the widget, placed: a window comes at once, as it opens only when placed)
		const refs = refFunctions(props.ref);
		if (refs.length > 0) {
			// (under the owner of the element, untracked, also when it comes later: what it makes goes
			// with the element, and what it throws reaches the boundary around it)
			const owner = getOwner();
			const give = (instance: HostNode): void =>
				runWithOwner(owner, () => {
					try {
						refs.forEach((ref) => ref(instance as R));
					} catch (error) {
						// (thrown here, it would leave the effect that placed the widget, outside the boundary
						// around the element: a computation of the owner that throws it gives it to that boundary)
						createRenderEffect(
							() => {
								throw error;
							},
							() => {},
						);
					}
				});
			node.withInstance((instance) => (instance instanceof WidgetInstance ? instance.whenPlaced(give) : give(instance)));
		}
		return node;
	};
}
