"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";
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

function formatTimestamp(iso: string): string {
	const date = new Date(iso);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMin = Math.floor(diffMs / 60000);

	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHrs = Math.floor(diffMin / 60);
	if (diffHrs < 24) return `${diffHrs}h ago`;
	const diffDays = Math.floor(diffHrs / 24);
	return `${diffDays}d ago`;
}

export function ArgumentNode({
	argument,
	isHighlighted,
	isDisputed,
	position,
	onClose,
}: {
	argument: Argument;
	isHighlighted: boolean;
	isDisputed: boolean;
	position: { x: number; y: number };
	onClose: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				onClose();
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [onClose]);

	return (
		<div
			ref={ref}
			className={clsx(
				"absolute z-40 max-w-sm rounded-lg border bg-white p-4 shadow-lg",
				isHighlighted && "border-yellow-400 ring-2 ring-yellow-300",
				!isHighlighted && "border-gray-200",
			)}
			style={{
				left: position.x + 30,
				top: position.y - 20,
			}}
		>
			<button
				onClick={onClose}
				className="absolute right-2 top-2 rounded p-1 text-gray-400 transition-colors hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
				aria-label="Close"
			>
				<svg
					width="12"
					height="12"
					viewBox="0 0 12 12"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M1 1l10 10M11 1L1 11" />
				</svg>
			</button>

			<div className="mb-2 flex items-center gap-2">
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
				{isDisputed && (
					<span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
						Disputed
					</span>
				)}
			</div>

			<p className="mb-2 text-sm leading-relaxed text-gray-800">
				{argument.contentText}
			</p>

			<div className="text-xs text-gray-400">
				{formatTimestamp(argument.createdAt)}
			</div>
		</div>
	);
}
