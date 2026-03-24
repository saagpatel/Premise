"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Argument } from "@/types";
import { ArgumentNode } from "./argument-node";

const FOR_COLOR = "#3B82F6";
const AGAINST_COLOR = "#F97316";
const CRUX_COLOR = "#EAB308";

interface TreeNodePosition {
	arg: Argument;
	x: number;
	y: number;
	strokeWidth: number;
	isDisputed: boolean;
	parentX: number | null;
	parentY: number | null;
}

function computePositions(args: Argument[]): TreeNodePosition[] {
	if (args.length === 0) return [];

	// Build parent-child map
	const byId = new Map<string, Argument>();
	for (const arg of args) {
		byId.set(arg.id, { ...arg, children: [] });
	}

	const roots: Argument[] = [];
	for (const arg of Array.from(byId.values())) {
		if (arg.parentArgumentId && byId.has(arg.parentArgumentId)) {
			const parent = byId.get(arg.parentArgumentId)!;
			parent.children = parent.children ?? [];
			parent.children.push(arg);
		} else {
			roots.push(arg);
		}
	}

	// Simple layout: assign x based on depth, y based on index within siblings
	const positions: TreeNodePosition[] = [];
	const nodeSpacingY = 70;
	const nodeSpacingX = 240;
	let yCounter = 0;

	function layout(
		node: Argument,
		depth: number,
		parentPos: { x: number; y: number } | null,
	) {
		const children = node.children ?? [];

		if (children.length === 0) {
			const x = depth * nodeSpacingX;
			const y = yCounter * nodeSpacingY;
			yCounter++;
			positions.push({
				arg: node,
				x,
				y,
				strokeWidth: Math.min(8, 2 + Math.max(0, node.netVoteScore) * 0.5),
				isDisputed: node.flagCount >= 5,
				parentX: parentPos?.x ?? null,
				parentY: parentPos?.y ?? null,
			});
			return;
		}

		// Layout children first, then center this node on them
		const childPositions: Array<{ x: number; y: number }> = [];
		for (const child of children) {
			const startY = yCounter;
			layout(child, depth + 1, null); // parent set below
			const endY = yCounter - 1;
			childPositions.push({
				x: (depth + 1) * nodeSpacingX,
				y: ((startY + endY) / 2) * nodeSpacingY,
			});
		}

		const minChildY = Math.min(...childPositions.map((c) => c.y));
		const maxChildY = Math.max(...childPositions.map((c) => c.y));
		const x = depth * nodeSpacingX;
		const y = (minChildY + maxChildY) / 2;

		positions.push({
			arg: node,
			x,
			y,
			strokeWidth: Math.min(8, 2 + Math.max(0, node.netVoteScore) * 0.5),
			isDisputed: node.flagCount >= 5,
			parentX: parentPos?.x ?? null,
			parentY: parentPos?.y ?? null,
		});

		// Update children's parentX/parentY
		const nodeChildren = node.children ?? [];
		for (const child of nodeChildren) {
			const childPos = positions.find((p) => p.arg.id === child.id);
			if (childPos) {
				childPos.parentX = x;
				childPos.parentY = y;
			}
		}
	}

	for (const root of roots) {
		layout(root, 0, null);
	}

	return positions;
}

export function ArgumentTree({
	arguments: args,
	cruxId,
}: {
	arguments: Argument[];
	cruxId: string | null;
}) {
	const svgRef = useRef<SVGSVGElement>(null);
	const gRef = useRef<SVGGElement>(null);
	const [selectedArg, setSelectedArg] = useState<{
		argument: Argument;
		position: { x: number; y: number };
	} | null>(null);

	const positions = computePositions(args);

	// D3 zoom — must run in useEffect (browser only)
	useEffect(() => {
		const svgEl = svgRef.current;
		const gEl = gRef.current;
		if (!svgEl || !gEl) return;

		// Dynamic import to avoid SSR issues with d3
		import("d3").then((d3) => {
			const svg = d3.select(svgEl);
			const g = d3.select(gEl);

			const zoom = d3
				.zoom<SVGSVGElement, unknown>()
				.scaleExtent([0.3, 3])
				.on("zoom", (event) => {
					g.attr("transform", event.transform.toString());
				});

			svg.call(zoom);

			// Initial centering
			if (positions.length > 0) {
				const { height } = svgEl.getBoundingClientRect();
				const initTransform = d3.zoomIdentity.translate(
					80,
					height / 2 - (positions[0]?.y ?? 0),
				);
				svg.call(zoom.transform, initTransform);
			}
		});
	}, [args.length]); // re-init zoom when argument count changes

	const handleNodeClick = useCallback((arg: Argument, x: number, y: number) => {
		setSelectedArg({ argument: arg, position: { x, y } });
	}, []);

	if (args.length === 0) {
		return (
			<div className="flex h-full min-h-[500px] items-center justify-center text-gray-400">
				<p className="text-lg">No arguments yet</p>
			</div>
		);
	}

	return (
		<div className="relative h-full min-h-[500px] w-full overflow-hidden">
			<svg
				ref={svgRef}
				width="100%"
				height="100%"
				className="h-full min-h-[500px] w-full"
			>
				<g ref={gRef}>
					{/* Edges */}
					{positions
						.filter((p) => p.parentX !== null && p.parentY !== null)
						.map((p) => {
							const midX = ((p.parentX ?? 0) + p.x) / 2;
							return (
								<path
									key={`edge-${p.arg.id}`}
									d={`M${p.parentX},${p.parentY} C${midX},${p.parentY} ${midX},${p.y} ${p.x},${p.y}`}
									fill="none"
									stroke="#94A3B8"
									strokeWidth={1.5}
									strokeOpacity={0.4}
								/>
							);
						})}

					{/* Nodes */}
					{positions.map((p) => {
						const isCrux = p.arg.id === cruxId;
						const fill = p.arg.side === "for" ? FOR_COLOR : AGAINST_COLOR;

						return (
							<g
								key={p.arg.id}
								transform={`translate(${p.x},${p.y})`}
								onClick={() => handleNodeClick(p.arg, p.x, p.y)}
								className="cursor-pointer"
								opacity={p.isDisputed ? 0.5 : 1}
							>
								{/* Crux glow ring */}
								{isCrux && (
									<circle
										r={28}
										fill="none"
										stroke={CRUX_COLOR}
										strokeWidth={3}
										className="crux-pulse"
									/>
								)}

								{/* Main node circle */}
								<circle
									r={20}
									fill={fill}
									stroke={isCrux ? CRUX_COLOR : "white"}
									strokeWidth={p.strokeWidth}
								/>

								{/* Type label */}
								<text
									y={32}
									textAnchor="middle"
									className="pointer-events-none select-none fill-gray-500 text-[10px]"
								>
									{p.arg.argumentType}
								</text>
							</g>
						);
					})}
				</g>
			</svg>

			{/* Node tooltip */}
			{selectedArg && (
				<ArgumentNode
					argument={selectedArg.argument}
					isHighlighted={selectedArg.argument.id === cruxId}
					isDisputed={selectedArg.argument.flagCount >= 5}
					position={selectedArg.position}
					onClose={() => setSelectedArg(null)}
				/>
			)}
		</div>
	);
}
