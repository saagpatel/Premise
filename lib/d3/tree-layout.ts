import * as d3 from "d3";
import type { Argument } from "@/types";

interface PositionedNode {
	data: Argument;
	x: number;
	y: number;
	depth: number;
	strokeWidth: number;
	isHighlighted: boolean;
	isDisputed: boolean;
	children: PositionedNode[];
	parent: PositionedNode | null;
}

const SYNTHETIC_ROOT_ID = "__root__";

function makeSyntheticRoot(children: Argument[]): Argument {
	return {
		id: SYNTHETIC_ROOT_ID,
		debateId: "",
		authorId: "",
		parentArgumentId: null,
		argumentType: "clarification",
		contentText: "",
		side: "for",
		netVoteScore: 0,
		flagCount: 0,
		createdAt: "",
		children,
	};
}

/**
 * Converts a flat array of arguments into positioned tree nodes
 * using d3.tree() with horizontal left-to-right layout.
 */
export function buildTreeLayout(args: Argument[]): PositionedNode[] {
	if (args.length === 0) return [];

	// Build parent-child relationships
	const byId = new Map<string, Argument>();
	for (const arg of args) {
		byId.set(arg.id, { ...arg, children: [] });
	}

	const roots: Argument[] = [];
	for (const arg of Array.from(byId.values())) {
		if (arg.parentArgumentId && byId.has(arg.parentArgumentId)) {
			const parent = byId.get(arg.parentArgumentId)!; // safe: checked has()
			parent.children = parent.children ?? [];
			parent.children.push(arg);
		} else {
			roots.push(arg);
		}
	}

	// d3.hierarchy needs a single root
	const treeRoot = roots.length === 1 ? roots[0] : makeSyntheticRoot(roots);

	const hierarchy = d3
		.hierarchy<Argument>(treeRoot, (d) => d.children ?? [])
		.sort((a, b) => a.data.createdAt.localeCompare(b.data.createdAt));

	const treeLayout = d3.tree<Argument>().nodeSize([60, 220]);
	const laid = treeLayout(hierarchy);

	const nodes: PositionedNode[] = [];

	laid.each((node) => {
		if (node.data.id === SYNTHETIC_ROOT_ID) return;

		nodes.push({
			data: node.data,
			// Swap x/y for horizontal LR layout (d3.tree is top-down by default)
			x: node.y,
			y: node.x,
			depth: node.depth,
			strokeWidth: Math.min(8, 2 + Math.max(0, node.data.netVoteScore) * 0.5),
			isHighlighted: false,
			isDisputed: node.data.flagCount >= 5,
			children: [],
			parent: null,
		});
	});

	return nodes;
}

export type { PositionedNode };
