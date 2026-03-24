import type { Argument } from "@/types";

interface TreeNode {
	arg: Argument;
	children: TreeNode[];
	depth: number;
}

interface SubtreeSides {
	hasFor: boolean;
	hasAgainst: boolean;
}

function buildTree(args: Argument[]): TreeNode[] {
	const byId = new Map<string, TreeNode>();
	for (const arg of args) {
		byId.set(arg.id, { arg, children: [], depth: 0 });
	}

	const roots: TreeNode[] = [];
	for (const node of Array.from(byId.values())) {
		if (node.arg.parentArgumentId && byId.has(node.arg.parentArgumentId)) {
			const parent = byId.get(node.arg.parentArgumentId)!; // safe: checked has()
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}

	// Assign depths
	function setDepths(node: TreeNode, depth: number) {
		node.depth = depth;
		for (const child of node.children) {
			setDepths(child, depth + 1);
		}
	}
	for (const root of roots) {
		setDepths(root, 0);
	}

	return roots;
}

function getSubtreeSides(node: TreeNode): SubtreeSides {
	let hasFor = node.arg.side === "for";
	let hasAgainst = node.arg.side === "against";

	for (const child of node.children) {
		const childSides = getSubtreeSides(child);
		hasFor = hasFor || childSides.hasFor;
		hasAgainst = hasAgainst || childSides.hasAgainst;
	}

	return { hasFor, hasAgainst };
}

/**
 * Finds the deepest node in the argument tree that has both "for" and "against"
 * descendants (including itself) in its subtree. This represents the crux — the
 * point where both sides of the debate converge.
 *
 * Returns the node's id, or null if no crux exists.
 */
export function findCrux(args: Argument[]): string | null {
	if (args.length === 0) return null;

	const roots = buildTree(args);

	let bestId: string | null = null;
	let bestDepth = -1;
	let bestCreatedAt = "";

	function traverse(node: TreeNode) {
		const sides = getSubtreeSides(node);

		if (sides.hasFor && sides.hasAgainst) {
			if (
				node.depth > bestDepth ||
				(node.depth === bestDepth && node.arg.createdAt > bestCreatedAt)
			) {
				bestId = node.arg.id;
				bestDepth = node.depth;
				bestCreatedAt = node.arg.createdAt;
			}
		}

		for (const child of node.children) {
			traverse(child);
		}
	}

	for (const root of roots) {
		traverse(root);
	}

	return bestId;
}
