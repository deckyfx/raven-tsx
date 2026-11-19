/**
 * The tiles the map asks for, drawn away from the interface as C draws them on Raven's worker
 * threads: `Rtask_run_async` would run a JavaScript function on the JavaScript thread, so this
 * keeps workers of its own, on the world they share, started when the first tile is asked for.
 */

import { TILE, type World, type WorldBuffers } from "./terrain";

/** A tile to draw, or drawn: its place and its pixels, which go back and forth without a copy. */
export interface TileJob {
	readonly kind: "tile";
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly pixels: ArrayBuffer;
}

/** The first message of a worker: the grids of the world. */
export interface WorldMessage {
	readonly kind: "world";
	readonly buffers: WorldBuffers;
}

/** What a worker is sent. */
export type WorkerMessage = WorldMessage | TileJob;

/** Where a tile is. */
interface TilePlace {
	readonly z: number;
	readonly x: number;
	readonly y: number;
}

/** Gives a drawn tile to the map. Its pixels are lent for the call only. */
export type TileDelivery = (z: number, x: number, y: number, pixels: Uint8Array) => void;

/** Tells the map that a tile will not come: the worker drawing it failed. */
export type TileFailure = (z: number, x: number, y: number) => void;

/** The workers, the tiles that wait for one, and the pixels they draw into. */
export class TileWorkers {
	/** Tiles asked for, and tiles no longer wanted, for the status line. */
	asked = 0;
	cancelled = 0;
	private readonly workers: Worker[] = [];
	private readonly idle: Worker[] = [];
	/** The tile each busy worker draws, and whether the map still wants it (it was not cancelled since). */
	private readonly drawing = new Map<Worker, { readonly tile: TilePlace; wanted: boolean }>();
	/** Workers that failed since a tile was last drawn: past a few, the pool stops starting new ones. */
	private failures = 0;
	private readonly waiting: TilePlace[] = [];
	/** Buffers of a tile, used again: as many as there are workers, in the end. */
	private readonly free: ArrayBuffer[] = [];

	constructor(
		private readonly world: World,
		private readonly workerCount: number,
		private readonly deliver: TileDelivery,
		private readonly fail: TileFailure,
	) {}

	/** The map needs a tile (`OnTile`): it waits for a worker. */
	readonly request = (z: number, x: number, y: number): void => {
		this.asked++;
		// (a new tile tries again, with a pool that failed to start before)
		if (this.workers.length === 0) {
			this.failures = 0;
		}
		this.start();
		this.waiting.push({ z, x, y });
		this.dispatch();
	};

	/**
	 * The user went elsewhere before the tile came (`OnTileCancelled`): the map will drop it. A
	 * tile no worker has begun is not drawn at all (a loader would stop the download here).
	 */
	readonly cancel = (z: number, x: number, y: number): void => {
		this.cancelled++;
		const index = this.waiting.findIndex((tile) => tile.z === z && tile.x === x && tile.y === y);
		if (index >= 0) {
			this.waiting.splice(index, 1);
		}
		// (one a worker draws: if it fails, that is not the map's concern, which may have asked again)
		for (const job of this.drawing.values()) {
			if (job.tile.z === z && job.tile.x === x && job.tile.y === y) {
				job.wanted = false;
			}
		}
	};

	/** Ends the workers. */
	dispose(): void {
		for (const worker of this.workers) {
			worker.terminate();
		}
		this.workers.length = 0;
		this.idle.length = 0;
		this.waiting.length = 0;
		this.drawing.clear();
	}

	/** Starts the workers the first time they are needed. */
	private start(): void {
		while (this.workers.length < this.workerCount) {
			const worker = new Worker(new URL("./tile-worker.ts", import.meta.url).href);
			const world: WorldMessage = { kind: "world", buffers: this.world.buffers };
			worker.postMessage(world);
			worker.addEventListener("message", (event: MessageEvent<TileJob>) => this.finished(worker, event.data));
			worker.addEventListener("error", (event: ErrorEvent) => this.failed(worker, event.message));
			this.workers.push(worker);
			this.idle.push(worker);
		}
	}

	/** Gives the waiting tiles to the idle workers, in the order they were asked for. */
	private dispatch(): void {
		while (this.idle.length > 0 && this.waiting.length > 0) {
			const worker = this.idle.pop();
			const tile = this.waiting.shift();
			if (worker === undefined || tile === undefined) {
				return;
			}
			const job: TileJob = { kind: "tile", ...tile, pixels: this.free.pop() ?? new ArrayBuffer(TILE * TILE * 4) };
			this.drawing.set(worker, { tile, wanted: true });
			worker.postMessage(job, [job.pixels]);
		}
	}

	/** A worker drew a tile: the map gets it (it copies the pixels), and the worker the next one. */
	private finished(worker: Worker, job: TileJob): void {
		this.drawing.delete(worker);
		this.failures = 0;
		this.deliver(job.z, job.x, job.y, new Uint8Array(job.pixels));
		this.free.push(job.pixels);
		this.idle.push(worker);
		this.dispatch();
	}

	/**
	 * A worker failed: the tile it drew will not come, which the map is told if it still wants it (it
	 * may ask again later; drawing it again at once could fail the same way), and another worker takes
	 * its place while tiles wait. Workers that keep failing, as one that cannot start, are not started
	 * again and again: past twice as many as the pool holds with no tile drawn, the tiles that wait
	 * fail too, and the next tile asked for tries a new pool.
	 */
	private failed(worker: Worker, message: string): void {
		console.error(`map: a tile worker failed: ${message}`);
		const job = this.drawing.get(worker);
		this.drawing.delete(worker);
		worker.terminate();
		const index = this.workers.indexOf(worker);
		if (index < 0) {
			// (ended already: disposed)
			return;
		}
		this.workers.splice(index, 1);
		const idle = this.idle.indexOf(worker);
		if (idle >= 0) {
			this.idle.splice(idle, 1);
		}
		if (job?.wanted === true) {
			this.fail(job.tile.z, job.tile.x, job.tile.y);
		}
		this.failures++;
		if (this.waiting.length === 0) {
			return;
		}
		if (this.failures <= this.workerCount * 2) {
			this.start();
		}
		this.dispatch();
		if (this.workers.length === 0) {
			for (const tile of this.waiting.splice(0)) {
				this.fail(tile.z, tile.x, tile.y);
			}
		}
	}
}
