"use client";

import clsx from "clsx";
import type { Argument, ArgumentType } from "@/types";

const TYPE_COLORS: Record<ArgumentType, string> = {
	evidence: "bg-violet-100 text-violet-800",
	analogy: "bg-sky-100 text-sky-800",
	counterexample: "bg-rose-100 text-rose-800",
	reductio: "bg-amber-100 text-amber-800",
	authority: "bg-emerald-100 text-emerald-800",
	concession: "bg-teal-100 text-teal-800",
	clarification: "bg-gray-100 text-gray-800",
};

const MAX_DISPLAY_DEPTH = 4;

function formatRelativeTime(iso: string): string {
	const diffMs = Date.now() - new Date(iso).getTime();
	const diffMin = Math.floor(diffMs / 60_000);
	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHrs = Math.floor(diffMin / 60);
	if (diffHrs < 24) return `${diffHrs}h ago`;
	const diffDays = Math.floor(diffHrs / 24);
	return `${diffDays}d ago`;
}

function computeDepth(arg: Argument, idMap: Map<string, Argument>): number {
	let depth = 0;
	let current: Argument = arg;
	while (current.parentArgumentId !== null && depth < MAX_DISPLAY_DEPTH) {
		const parent = idMap.get(current.parentArgumentId);
		if (!parent) break;
		depth++;
		current = parent;
	}
	return depth;
}

type ArgumentCardProps = {
	argument: Argument;
	depth: number;
	isCrux: boolean;
};

function ArgumentCard({ argument, depth, isCrux }: ArgumentCardProps) {
	const indentPx = Math.min(depth * 16, 64);
	const isDisputed = argument.flagCount >= 5;

	const borderColor = isCrux
		? "#EAB308"
		: argument.side === "for"
			? "#3B82F6"
			: "#F97316";

	return (
		<div
			style={{ paddingLeft: indentPx, opacity: isDisputed ? 0.5 : 1 }}
			className="px-3 py-1"
		>
			<div
				className="rounded-lg bg-white p-3 shadow-sm"
				style={{ borderLeft: `3px solid ${borderColor}` }}
			>
				{/* Top row */}
				<div className="mb-1.5 flex flex-wrap items-center gap-2">
					<span
						className={clsx(
							"rounded-full px-2 py-0.5 text-xs font-medium capitalize",
							TYPE_COLORS[argument.argumentType],
						)}
					>
						{argument.argumentType}
					</span>
					<span
						className={clsx(
							"text-xs font-semibold",
							argument.side === "for" ? "text-blue-600" : "text-orange-600",
						)}
					>
						{argument.side === "for" ? "For" : "Against"}
					</span>
					<span className="font-mono text-sm text-gray-500">
						{argument.netVoteScore > 0
							? `+${argument.netVoteScore}`
							: argument.netVoteScore}
					</span>
					{isCrux && (
						<span className="rounded-full bg-yellow-400 px-2 py-0.5 text-xs font-semibold text-yellow-900">
							Crux
						</span>
					)}
					{isDisputed && (
						<span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
							Disputed
						</span>
					)}
				</div>

				{/* Body */}
				<p className="text-sm leading-relaxed text-gray-800">
					{argument.contentText}
				</p>

				{/* Footer */}
				<p className="mt-1.5 text-xs text-gray-400">
					{formatRelativeTime(argument.createdAt)}
				</p>
			</div>
		</div>
	);
}

type Props = {
	arguments: Argument[];
	cruxId: string | null;
};

export function ThreadView({ arguments: args, cruxId }: Props) {
	if (args.length === 0) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-sm text-gray-400">No arguments yet</p>
			</div>
		);
	}

	// Build id → argument lookup
	const idMap = new Map<string, Argument>(args.map((a) => [a.id, a]));

	// Sort by createdAt ASC
	const sorted = [...args].sort(
		(a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
	);

	return (
		<div className="overflow-y-auto h-full py-2 space-y-2">
			{sorted.map((arg) => (
				<ArgumentCard
					key={arg.id}
					argument={arg}
					depth={computeDepth(arg, idMap)}
					isCrux={arg.id === cruxId}
				/>
			))}
		</div>
	);
}
