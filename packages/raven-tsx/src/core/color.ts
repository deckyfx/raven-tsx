/** A color as this package writes it, `#RRGGBB` or `#RRGGBBAA`, and the numbers Raven takes for it. */

/** What a color of this package looks like. */
export const COLOR = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** A color as the four numbers Raven takes, from 0 to 1. Without its alpha, it is opaque. */
export function colorOf(color: string): [red: number, green: number, blue: number, alpha: number] {
	const channel = (from: number): number => parseInt(color.slice(from, from + 2), 16) / 255;
	return [channel(1), channel(3), channel(5), color.length > 7 ? channel(7) : 1];
}
