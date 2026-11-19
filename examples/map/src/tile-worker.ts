/** A thread that draws tiles: it gets the world once, then a tile at a time, and sends each one back. */

import { TileArtist, World } from "./terrain";
import type { TileJob, WorkerMessage } from "./tiles";

declare const self: Worker;

let artist: TileArtist | null = null;

self.addEventListener("message", (event: MessageEvent<WorkerMessage>): void => {
	const message = event.data;
	if (message.kind === "world") {
		artist = new TileArtist(World.from(message.buffers));
		return;
	}
	artist?.draw(new Uint8Array(message.pixels), message.z, message.x, message.y);
	// (the pixels go back without a copy, and come again with another tile)
	const done: TileJob = message;
	self.postMessage(done, [message.pixels]);
});
