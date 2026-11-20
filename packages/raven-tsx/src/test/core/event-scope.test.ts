/** The commit at the end of an event, when React and Solid both run: what one's commit gives the other is committed too. */

import { expect, spyOn, test } from "bun:test";
import { CROSS_PASSES, EventScope } from "../../core/events";

/** A framework that holds updates until it flushes, as React and Solid do: its commit may give another work. */
class Framework {
	readonly committed: string[] = [];
	private pending: string[] = [];
	/** What its commit does besides: an effect that updates another framework. */
	onCommit: (value: string) => void = () => {};

	update(value: string): void {
		this.pending.push(value);
	}

	flush(): void {
		const pending = this.pending;
		this.pending = [];
		for (const value of pending) {
			this.committed.push(value);
			this.onCommit(value);
		}
	}
}

/** Two frameworks in a scope, in this order; the second's commit updates the first. */
function scopeWith(order: "first-updates-second" | "second-updates-first"): { scope: EventScope; source: Framework; target: Framework } {
	const scope = new EventScope();
	const first = new Framework();
	const second = new Framework();
	scope.addFlush(() => first.flush());
	scope.addFlush(() => second.flush());
	const [source, target] = order === "first-updates-second" ? [first, second] : [second, first];
	source.onCommit = (value) => target.update(`from ${value}`);
	return { scope, source, target };
}

test("what a commit gives a framework flushed before it is committed before the event ends", () => {
	const { scope, source, target } = scopeWith("second-updates-first");
	scope.run(() => source.update("click"));
	expect(source.committed).toEqual(["click"]);
	expect(target.committed).toEqual(["from click"]);
});

test("what a commit gives a framework flushed after it is committed before the event ends", () => {
	const { scope, source, target } = scopeWith("first-updates-second");
	scope.run(() => source.update("click"));
	expect(source.committed).toEqual(["click"]);
	expect(target.committed).toEqual(["from click"]);
});

test("the put-back of controlled widgets comes after both commits", () => {
	const { scope, source, target } = scopeWith("second-updates-first");
	let seen: string[] = [];
	scope.run(
		() => source.update("click"),
		() => {
			seen = [...target.committed];
		},
	);
	expect(seen).toEqual(["from click"]);
});

test("what a handler wrote before it threw is committed, and the put-back runs, the error said", () => {
	const scope = new EventScope();
	const framework = new Framework();
	scope.addFlush(() => framework.flush());
	let putBack = false;
	const said = spyOn(console, "error").mockImplementation(() => {});
	try {
		scope.run(
			() => {
				framework.update("written");
				throw new Error("after the write");
			},
			() => {
				putBack = true;
			},
		);
		expect(framework.committed).toEqual(["written"]);
		expect(putBack).toBe(true);
		expect(said).toHaveBeenCalledTimes(1);
	} finally {
		said.mockRestore();
	}
});

test("the put-back runs when a commit throws", () => {
	const scope = new EventScope();
	scope.addFlush(() => {
		throw new Error("in the commit");
	});
	let putBack = false;
	const said = spyOn(console, "error").mockImplementation(() => {});
	try {
		scope.run(
			() => {},
			() => {
				putBack = true;
			},
		);
		expect(putBack).toBe(true);
		expect(said).toHaveBeenCalledTimes(1);
	} finally {
		said.mockRestore();
	}
});

test("a handler that throws and a commit that throws after it are both said", () => {
	const scope = new EventScope();
	scope.addFlush(() => {
		throw new Error("in the commit");
	});
	const said = spyOn(console, "error").mockImplementation(() => {});
	try {
		scope.run(() => {
			throw new Error("in the handler");
		});
		expect(said.mock.calls.map((call) => (call[1] as Error).message)).toEqual(["in the handler", "in the commit"]);
	} finally {
		said.mockRestore();
	}
});

test("a chain of hand-overs back and forth is committed before the event ends, whichever framework starts", () => {
	for (const start of ["first", "second"] as const) {
		const scope = new EventScope();
		const first = new Framework();
		const second = new Framework();
		scope.addFlush(() => first.flush());
		scope.addFlush(() => second.flush());
		// (each commit gives the other the next step, until the last: a chain of as many hand-overs as the passes allow)
		const last = CROSS_PASSES - 1;
		const step = (to: Framework) => (value: string) => {
			const index = Number(value);
			if (index < last) {
				to.update(String(index + 1));
			}
		};
		first.onCommit = step(second);
		second.onCommit = step(first);
		let seen = 0;
		scope.run(
			() => (start === "first" ? first : second).update("0"),
			() => {
				seen = first.committed.length + second.committed.length;
			},
		);
		expect(seen).toBe(last + 1);
	}
});
