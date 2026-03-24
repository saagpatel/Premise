import { describe, expect, it } from "vitest";
import type { Argument } from "@/types";
import { buildTreeLayout } from "./tree-layout";

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

describe("buildTreeLayout", () => {
	it("should return empty array for empty input", () => {
		expect(buildTreeLayout([])).toEqual([]);
	});

	it("should position a single root node", () => {
		const arg = makeArgument({ id: "root" });
		const nodes = buildTreeLayout([arg]);

		expect(nodes).toHaveLength(1);
		expect(nodes[0].data.id).toBe("root");
	});

	it("should handle a 10-node chain with increasing x positions", () => {
		const args: Argument[] = [];
		let parentId: string | null = null;

		for (let i = 0; i < 10; i++) {
			const id = `node-${i}`;
			args.push(
				makeArgument({
					id,
					parentArgumentId: parentId,
					createdAt: new Date(2024, 0, 1, 0, 0, i).toISOString(),
				}),
			);
			parentId = id;
		}

		const nodes = buildTreeLayout(args);
		expect(nodes).toHaveLength(10);

		// In horizontal LR layout, x values should increase along the chain
		const xValues = nodes.map((n) => n.x);
		for (let i = 1; i < xValues.length; i++) {
			expect(xValues[i]).toBeGreaterThan(xValues[i - 1]);
		}
	});

	it("should compute strokeWidth = 2 for netVoteScore 0", () => {
		const nodes = buildTreeLayout([makeArgument({ netVoteScore: 0 })]);
		expect(nodes[0].strokeWidth).toBe(2);
	});

	it("should compute strokeWidth = 5 for netVoteScore 6", () => {
		const nodes = buildTreeLayout([makeArgument({ netVoteScore: 6 })]);
		expect(nodes[0].strokeWidth).toBe(5);
	});

	it("should cap strokeWidth at 8 for high vote scores", () => {
		const nodes = buildTreeLayout([makeArgument({ netVoteScore: 20 })]);
		expect(nodes[0].strokeWidth).toBe(8);
	});

	it("should treat negative vote scores as 0 for strokeWidth", () => {
		const nodes = buildTreeLayout([makeArgument({ netVoteScore: -5 })]);
		expect(nodes[0].strokeWidth).toBe(2);
	});

	it("should handle multiple root nodes via synthetic root", () => {
		const args = [
			makeArgument({ id: "root-1", side: "for" }),
			makeArgument({ id: "root-2", side: "against" }),
		];
		const nodes = buildTreeLayout(args);

		expect(nodes).toHaveLength(2);
		// Synthetic root should NOT be in output
		expect(nodes.every((n) => n.data.id !== "__root__")).toBe(true);
	});

	it("should mark isDisputed true when flagCount >= 5", () => {
		const nodes = buildTreeLayout([makeArgument({ flagCount: 5 })]);
		expect(nodes[0].isDisputed).toBe(true);
	});

	it("should mark isDisputed false when flagCount < 5", () => {
		const nodes = buildTreeLayout([makeArgument({ flagCount: 4 })]);
		expect(nodes[0].isDisputed).toBe(false);
	});

	it("should set isHighlighted to false by default", () => {
		const nodes = buildTreeLayout([makeArgument()]);
		expect(nodes[0].isHighlighted).toBe(false);
	});
});
