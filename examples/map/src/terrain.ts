/**
 * The tiles the example draws, as `main.c` of Raven draws them: the sea and the land of the
 * outline of `world.ts` roughened by noise, a graticule, and the z/x/y of each tile in its
 * corner, so that the tiling shows.
 *
 * Nothing here loads Raven: the workers of `tile-worker.ts` import it, and draw on their own.
 * The arithmetic is that of C. The outline is filled in 32-bit floats as there, since a cell of
 * the coast can depend on it; the rest is in doubles where C has floats, which moves a few
 * pixels of a tile by one level of 255.
 */

import { END, SHAPE_END, WORLD } from "./world";

/** The size of a tile, in pixels. */
export const TILE = 256;

/** The land, rasterized once: a quarter of a degree per cell. */
const MASK_W = 1440;
const MASK_H = 720;

/** The two grids of the world, in memory the workers share. */
export interface WorldBuffers {
	/** 1 where there is land, 0 for the sea: a byte per cell. */
	readonly mask: SharedArrayBuffer;
	/** How near the land is: the mask blurred, a 32-bit float per cell (for the shallows). */
	readonly near: SharedArrayBuffer;
}

/** The land of the world as two grids of cells, row 0 at the north pole. */
export class World {
	readonly mask: Uint8Array;
	readonly near: Float32Array;

	private constructor(readonly buffers: WorldBuffers) {
		this.mask = new Uint8Array(buffers.mask);
		this.near = new Float32Array(buffers.near);
	}

	/** The grids of a world built elsewhere (in a worker: those the application built). */
	static from(buffers: WorldBuffers): World {
		return new World(buffers);
	}

	/** Rasterizes the outline and blurs it: once, before the window opens, as C does. */
	static build(): World {
		const world = new World({
			mask: new SharedArrayBuffer(MASK_W * MASK_H),
			near: new SharedArrayBuffer(MASK_W * MASK_H * Float32Array.BYTES_PER_ELEMENT),
		});
		world.fillShapes();
		world.blur();
		return world;
	}

	/** The pairs up to a `SHAPE_END` are one shape. */
	private fillShapes(): void {
		const pairs = WORLD.length / 2;
		let start = 0;
		for (let i = 0; i < pairs; i++) {
			if (WORLD[i * 2] === SHAPE_END) {
				this.fillShape(start, i - start);
				start = i + 1;
			}
		}
	}

	/**
	 * Fills the rings of one shape (even-odd) into the mask, row by row. In 32-bit floats, as C
	 * does it (`f` is Math.fround): in doubles, a few cells of the coast would come out otherwise.
	 */
	private fillShape(first: number, count: number): void {
		const f = Math.fround;
		const crossings = new Float32Array(512);
		const point = (i: number, axis: number): number => WORLD[(first + i) * 2 + axis] ?? 0;
		/** The column of a crossing, as C works it out. */
		const column = (x: number): number => f(f(f(f(x + 180) * MASK_W) / 360) - 0.5);
		for (let row = 0; row < MASK_H; row++) {
			const lat = f(90 - f(f(f(row + 0.5) * 180) / MASK_H));
			let n = 0;
			let start = 0;
			for (let i = 0; i < count; i++) {
				if (point(i, 0) === END) {
					start = i + 1;
					continue;
				}
				const next = i + 1 < count && point(i + 1, 0) !== END ? i + 1 : start;
				const ax = point(i, 0);
				const ay = point(i, 1);
				const bx = point(next, 0);
				const by = point(next, 1);
				if (ay <= lat !== by <= lat && n < 512) {
					// (an insertion sort: a row crosses a shape a few times)
					const x = f(ax + f(f(f(lat - ay) / f(by - ay)) * f(bx - ax)));
					let k = n++;
					while (k > 0 && (crossings[k - 1] ?? 0) > x) {
						crossings[k] = crossings[k - 1] ?? 0;
						k--;
					}
					crossings[k] = x;
				}
			}
			for (let i = 0; i + 1 < n; i += 2) {
				const x0 = Math.max(0, Math.ceil(column(crossings[i] ?? 0)));
				const x1 = Math.min(MASK_W - 1, Math.floor(column(crossings[i + 1] ?? 0)));
				this.mask.fill(1, row * MASK_W + x0, row * MASK_W + x1 + 1);
			}
		}
	}

	/** How near the land is: the mask blurred, three box passes of 9 cells, across the antimeridian. */
	private blur(): void {
		const { mask, near } = this;
		const scratch = new Float32Array(Math.max(MASK_W, MASK_H));
		near.set(mask);
		for (let pass = 0; pass < 3; pass++) {
			for (let y = 0; y < MASK_H; y++) {
				const row = y * MASK_W;
				for (let x = 0; x < MASK_W; x++) {
					let sum = 0;
					for (let k = -4; k <= 4; k++) {
						sum += near[row + ((x + k + MASK_W) % MASK_W)] ?? 0;
					}
					scratch[x] = sum / 9;
				}
				near.set(scratch.subarray(0, MASK_W), row);
			}
			for (let x = 0; x < MASK_W; x++) {
				for (let y = 0; y < MASK_H; y++) {
					let sum = 0;
					for (let k = -4; k <= 4; k++) {
						const yy = y + k < 0 ? 0 : y + k >= MASK_H ? MASK_H - 1 : y + k;
						sum += near[yy * MASK_W + x] ?? 0;
					}
					scratch[y] = sum / 9;
				}
				for (let y = 0; y < MASK_H; y++) {
					near[y * MASK_W + x] = scratch[y] ?? 0;
				}
			}
		}
	}
}

/** Bilinear sample of a grid of the world in degrees (longitude wraps). */
function sample(grid: Uint8Array | Float32Array, lon: number, lat: number): number {
	const fx = ((lon + 180) * MASK_W) / 360 - 0.5;
	const fy = ((90 - lat) * MASK_H) / 180 - 0.5;
	let x0 = Math.floor(fx);
	let y0 = Math.floor(fy);
	const tx = fx - x0;
	const ty = fy - y0;
	const x1 = (((x0 + 1) % MASK_W) + MASK_W) % MASK_W;
	let y1 = y0 + 1;
	x0 = ((x0 % MASK_W) + MASK_W) % MASK_W;
	y0 = y0 < 0 ? 0 : y0 >= MASK_H ? MASK_H - 1 : y0;
	y1 = y1 < 0 ? 0 : y1 >= MASK_H ? MASK_H - 1 : y1;
	const top = (grid[y0 * MASK_W + x0] ?? 0) * (1 - tx) + (grid[y0 * MASK_W + x1] ?? 0) * tx;
	const bottom = (grid[y1 * MASK_W + x0] ?? 0) * (1 - tx) + (grid[y1 * MASK_W + x1] ?? 0) * tx;
	return top * (1 - ty) + bottom * ty;
}

/** A value in -1..1 from a hash of a point of the lattice (the unsigned arithmetic of C, by Math.imul). */
function hash2(x: number, y: number): number {
	let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) & 0xffff) / 32767.5 - 1;
}

/** Value noise: smooth, in -1..1. */
function noise(x: number, y: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = x - ix;
	const fy = y - iy;
	const sx = fx * fx * (3 - 2 * fx);
	const sy = fy * fy * (3 - 2 * fy);
	const a = hash2(ix, iy);
	const b = hash2(ix + 1, iy);
	const c = hash2(ix, iy + 1);
	const d = hash2(ix + 1, iy + 1);
	return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

/** Octaves of noise, from `frequency` cycles per degree up to what a pixel of `pixel` degrees can show. */
function fbm(lon: number, lat: number, frequency: number, pixel: number): number {
	let sum = 0;
	let amplitude = 0.5;
	for (let octave = 0; octave < 12 && frequency * pixel < 0.2; octave++) {
		sum += amplitude * noise(lon * frequency + octave * 17.3, lat * frequency - octave * 9.1);
		frequency *= 2;
		amplitude *= 0.5;
	}
	return sum;
}

/** Hermite step from 0 at `edge0` to 1 at `edge1`. */
function smooth(edge0: number, edge1: number, x: number): number {
	let t = (x - edge0) / (edge1 - edge0);
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	return t * t * (3 - 2 * t);
}

/** From `a` to `b` by `t`. */
function mix(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/** Degrees between two lines of the graticule at a zoom. */
function graticuleStep(z: number): number {
	if (z <= 2) return 30;
	if (z <= 4) return 10;
	if (z <= 6) return 5;
	if (z <= 8) return 1;
	if (z <= 11) return 0.25;
	return 0.05;
}

/** Digits and '/' of 3 x 5 cells, a row per 3 bits. */
const GLYPHS = [0o75557, 0o26227, 0o71747, 0o71717, 0o55711, 0o74717, 0o74757, 0o71111, 0o75757, 0o75717, 0o11244];

/** Writes digits and slashes at `scale` pixels per cell: a dark halo, then the white letters. */
function putText(pixels: Uint8Array, x: number, y: number, text: string, scale: number): void {
	for (let pass = 0; pass < 2; pass++) {
		let cx = x;
		for (let c = 0; c < text.length; c++) {
			const code = text.charCodeAt(c);
			const glyph = code === 0x2f ? 10 : code - 0x30;
			const bits = GLYPHS[glyph];
			if (bits === undefined) continue;
			for (let row = 0; row < 5; row++) {
				for (let col = 0; col < 3; col++) {
					if (!((bits >> ((4 - row) * 3 + (2 - col))) & 1)) continue;
					// (the halo: the cell darkened at 9 offsets around it)
					for (let o = 0; o < (pass === 0 ? 9 : 1); o++) {
						const ox = pass === 0 ? (o % 3) - 1 : 0;
						const oy = pass === 0 ? Math.floor(o / 3) - 1 : 0;
						for (let dy = 0; dy < scale; dy++) {
							for (let dx = 0; dx < scale; dx++) {
								const px = cx + col * scale + dx + ox;
								const py = y + row * scale + dy + oy;
								if (px < 0 || py < 0 || px >= TILE || py >= TILE) continue;
								const p = (py * TILE + px) * 4;
								if (pass === 0) {
									pixels[p] = (pixels[p] ?? 0) * 0.45;
									pixels[p + 1] = (pixels[p + 1] ?? 0) * 0.45;
									pixels[p + 2] = (pixels[p + 2] ?? 0) * 0.45;
								} else {
									pixels[p] = pixels[p + 1] = pixels[p + 2] = 255;
								}
							}
						}
					}
				}
			}
			cx += 4 * scale;
		}
	}
}

/**
 * Draws tiles into RGBA8 pixels. It allocates nothing per pixel: what depends only on the row
 * (the latitude) is worked out once per row, the longitudes once per tile.
 */
export class TileArtist {
	private readonly longitudes = new Float64Array(TILE);

	constructor(private readonly world: World) {}

	/** Draws tile `tx`, `ty` of zoom `z` into `pixels` (TILE x TILE x 4 bytes). */
	draw(pixels: Uint8Array, z: number, tx: number, ty: number): void {
		const { mask, near } = this.world;
		const lons = this.longitudes;
		const n = 2 ** z;
		const pixel = 360 / (n * TILE);
		const step = graticuleStep(z);
		// the noise that roughens the coast: features smaller than the mask, down to the pixel
		const rough = 0.35;
		const edge = (pixel / 0.25) * 0.6;
		for (let px = 0; px < TILE; px++) {
			lons[px] = ((tx + (px + 0.5) / TILE) / n) * 360 - 180;
		}

		for (let py = 0; py < TILE; py++) {
			const my = (ty + (py + 0.5) / TILE) / n;
			const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;
			const pixelLat = pixel * Math.cos((lat * Math.PI) / 180);
			const gridLat = (Math.abs(lat / step - Math.floor(lat / step + 0.5)) * step) / pixelLat;
			const mainLat = gridLat < 0.8 && Math.abs(lat) < step * 0.5;
			const alat = Math.abs(lat);
			// the land by latitude: forests at the equator, deserts in the horse latitudes, tundra, then ice
			const temperate = smooth(10, 35, alat);
			const horse = 1 - smooth(8, 16, Math.abs(alat - 24));
			const tundra = smooth(52, 64, alat);
			const ice = lat < 0 ? smooth(-60, -64, lat) : smooth(70, 76, alat);
			const baseR = mix(74, 104, temperate);
			const baseG = mix(132, 150, temperate);
			const baseB = mix(66, 82, temperate);
			let p = py * TILE * 4;
			for (let px = 0; px < TILE; px++, p += 4) {
				const lon = lons[px] ?? 0;
				const dx = fbm(lon, lat, 0.6, pixel) * rough;
				const dy = fbm(lon + 40, lat - 25, 0.6, pixel) * rough;
				const land = sample(mask, lon + dx, lat + dy) + fbm(lon, lat, 2, pixel) * 0.25;
				const a = smooth(0.5 - edge - 0.01, 0.5 + edge + 0.01, land);
				// the sea: deep, lighter over the shelves near the coast
				const shallow = smooth(0.02, 0.45, sample(near, lon, lat));
				let r = mix(22, 70, shallow);
				let g = mix(64, 140, shallow);
				let b = mix(118, 186, shallow);
				if (a > 0) {
					// (the land only where it shows: C works it out everywhere, to the same pixels)
					const dry = smooth(0.15, 0.55, fbm(lon * 0.5, lat * 0.5, 0.08, pixel) + 0.5) * horse;
					let lr = mix(baseR, 222, dry);
					let lg = mix(baseG, 196, dry);
					let lb = mix(baseB, 140, dry);
					lr = mix(mix(lr, 150, tundra), 238, ice);
					lg = mix(mix(lg, 156, tundra), 242, ice);
					lb = mix(mix(lb, 132, tundra), 247, ice);
					const shade = 0.9 + 0.22 * fbm(lon * 3, lat * 3, 0.5, pixel);
					r = mix(r, lr * shade, a);
					g = mix(g, lg * shade, a);
					b = mix(b, lb * shade, a);
				}
				// the graticule: the equator and the prime meridian stronger
				const gridLon = (Math.abs(lon / step - Math.floor(lon / step + 0.5)) * step) / pixel;
				if (gridLon < 0.8 || gridLat < 0.8) {
					const mainLine = (gridLon < 0.8 && Math.abs(lon) < step * 0.5) || mainLat;
					const t = mainLine ? 0.55 : 0.28;
					r = mix(r, 255, t);
					g = mix(g, 255, t);
					b = mix(b, 255, t);
				}
				// the edge of the tile
				if (px === 0 || py === 0) {
					r *= 0.8;
					g *= 0.8;
					b *= 0.8;
				}
				// (a Uint8Array truncates, as the cast of C does)
				pixels[p] = r > 255 ? 255 : r;
				pixels[p + 1] = g > 255 ? 255 : g;
				pixels[p + 2] = b > 255 ? 255 : b;
				pixels[p + 3] = 255;
			}
		}
		putText(pixels, 6, 6, `${z}/${tx}/${ty}`, 2);
	}
}
