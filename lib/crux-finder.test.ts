import { describe, expect, it } from "vitest";
import type { Argument } from "@/types";
import { findCrux } from "./crux-finder";

function makeArgument(overrides: Partial<Argument> = {}): Argument {
	return {
		id: crypto.randomUUID(),
		debateId: "debate-1",
		authorId: "user-1",
		parentArgumentId: null,
		argumentType: "evidence",
		contentText: "Test argument",
		side: "for",
		netVoteScore: 0,
		flagCount: 0,
		createdAt: new Date().toISOString(),
		...overrides,
	};
}

describe("findCrux", () => {
	it("should return null for empty array", () => {
		expect(findCrux([])).toBeNull();
	});

	it("should return null for a single argument", () => {
		expect(findCrux([makeArgument()])).toBeNull();
	});

	it("should return null for a linear chain of same-side arguments", () => {
		const root = makeArgument({ id: "r", side: "for" });
		const child = makeArgument({
			id: "c",
			parentArgumentId: "r",
			side: "for",
		});
		expect(findCrux([root, child])).toBeNull();
	});

	it("should return the root when both sides respond to it", () => {
		const root = makeArgument({ id: "root", side: "for" });
		const forChild = makeArgument({
			id: "for-child",
			parentArgumentId: "root",
			side: "for",
		});
		const againstChild = makeArgument({
			id: "against-child",
			parentArgumentId: "root",
			side: "against",
		});

		expect(findCrux([root, forChild, againstChild])).toBe("root");
	});

	it("should prefer the deeper crux node over a shallower one", () => {
		// root (for) → mid (against) → deep-for (for) + deep-against (against)
		// Both root and mid qualify, but mid is deeper
		const root = makeArgument({ id: "root", side: "for" });
		const mid = makeArgument({
			id: "mid",
			parentArgumentId: "root",
			side: "against",
		});
		const deepFor = makeArgument({
			id: "deep-for",
			parentArgumentId: "mid",
			side: "for",
		});
		const deepAgainst = makeArgument({
			id: "deep-against",
			parentArgumentId: "mid",
			side: "against",
		});

		expect(findCrux([root, mid, deepFor, deepAgainst])).toBe("mid");
	});

	it("should break ties at same depth by most recent createdAt", () => {
		const root = makeArgument({ id: "root", side: "for" });

		const branch1 = makeArgument({
			id: "b1",
			parentArgumentId: "root",
			side: "for",
			createdAt: "2024-01-01T00:00:00Z",
		});
		const b1For = makeArgument({
			id: "b1-for",
			parentArgumentId: "b1",
			side: "for",
		});
		const b1Against = makeArgument({
			id: "b1-against",
			parentArgumentId: "b1",
			side: "against",
		});

		const branch2 = makeArgument({
			id: "b2",
			parentArgumentId: "root",
			side: "against",
			createdAt: "2024-06-01T00:00:00Z",
		});
		const b2For = makeArgument({
			id: "b2-for",
			parentArgumentId: "b2",
			side: "for",
		});
		const b2Against = makeArgument({
			id: "b2-against",
			parentArgumentId: "b2",
			side: "against",
		});

		// Both b1 and b2 are at depth 1 with for+against children.
		// b2 has later createdAt → should win.
		const result = findCrux([
			root,
			branch1,
			b1For,
			b1Against,
			branch2,
			b2For,
			b2Against,
		]);
		expect(result).toBe("b2");
	});

	it("should handle nodes where the node itself provides one side", () => {
		// A "for" node with only "against" children still qualifies
		// because the node itself is "for" and its children are "against"
		const root = makeArgument({ id: "root", side: "for" });
		const child = makeArgument({
			id: "child",
			parentArgumentId: "root",
			side: "against",
		});

		expect(findCrux([root, child])).toBe("root");
	});
});
