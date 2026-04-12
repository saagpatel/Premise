"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import type { Argument, ArgumentType, FlagReason } from "@/types";
import { useDebate } from "./debate-provider";
import { VotingControls } from "./voting-controls";

const TYPE_COLORS: Record<ArgumentType, string> = {
	evidence: "bg-violet-100 text-violet-800",
	analogy: "bg-sky-100 text-sky-800",
	counterexample: "bg-rose-100 text-rose-800",
	reductio: "bg-amber-100 text-amber-800",
	authority: "bg-emerald-100 text-emerald-800",
	concession: "bg-teal-100 text-teal-800",
	clarification: "bg-gray-100 text-gray-800",
};

const FLAG_REASONS: { value: FlagReason; label: string }[] = [
	{ value: "bad_faith", label: "Bad faith" },
	{ value: "personal_attack", label: "Personal attack" },
	{ value: "off_topic", label: "Off topic" },
	{ value: "spam", label: "Spam" },
	{ value: "other", label: "Other" },
];

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

type FlagStatus =
	| "idle"
	| "submitting"
	| "flagged"
	| "already_flagged"
	| "own_argument";

function FlagPopover({
	argumentId,
	onClose,
}: {
	argumentId: string;
	onClose: () => void;
}) {
	const [reason, setReason] = useState<FlagReason>("bad_faith");
	const [status, setStatus] = useState<FlagStatus>("idle");

	async function handleSubmit() {
		setStatus("submitting");
		try {
			const res = await fetch("/api/flags", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ argumentId, reason }),
			});

			if (res.ok) {
				setStatus("flagged");
				setTimeout(onClose, 1200);
				return;
			}

			if (res.status === 409) {
				setStatus("already_flagged");
				return;
			}

			if (res.status === 403) {
				setStatus("own_argument");
				return;
			}

			// Other errors: reset to idle so user can retry
			setStatus("idle");
		} catch {
			setStatus("idle");
		}
	}

	const feedbackMessage =
		status === "flagged"
			? "Flagged"
			: status === "already_flagged"
				? "Already flagged"
				: status === "own_argument"
					? "Cannot flag your own argument"
					: null;

	return (
		<div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 shadow-sm">
			{feedbackMessage !== null ? (
				<p
					className={clsx(
						"text-xs font-medium",
						status === "flagged" ? "text-green-600" : "text-amber-600",
					)}
				>
					{feedbackMessage}
				</p>
			) : (
				<>
					<select
						value={reason}
						onChange={(e) => setReason(e.target.value as FlagReason)}
						disabled={status === "submitting"}
						className="mb-2 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						{FLAG_REASONS.map((r) => (
							<option key={r.value} value={r.value}>
								{r.label}
							</option>
						))}
					</select>
					<button
						onClick={() => void handleSubmit()}
						disabled={status === "submitting"}
						className={clsx(
							"w-full rounded px-3 py-1.5 text-xs font-medium transition-colors",
							"focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1",
							status === "submitting"
								? "cursor-not-allowed bg-gray-200 text-gray-400"
								: "bg-red-50 text-red-700 hover:bg-red-100",
						)}
					>
						{status === "submitting" ? "Submitting…" : "Submit Flag"}
					</button>
				</>
			)}
		</div>
	);
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
	const { isParticipant, userVotes, castVote } = useDebate();
	const [flagOpen, setFlagOpen] = useState(false);

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

			<p className="mb-3 text-sm leading-relaxed text-gray-800">
				{argument.contentText}
			</p>

			<VotingControls
				argumentId={argument.id}
				currentScore={argument.netVoteScore}
				isParticipant={isParticipant}
				hasVoted={userVotes.has(argument.id)}
				onVote={(vote) => castVote(argument.id, vote)}
			/>

			<div className="mt-2 flex items-center justify-between">
				<button
					onClick={() => setFlagOpen((prev) => !prev)}
					aria-label="Flag argument"
					aria-expanded={flagOpen}
					className={clsx(
						"rounded p-1 text-base leading-none transition-colors",
						"focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1",
						flagOpen ? "text-red-500" : "text-gray-300 hover:text-gray-500",
					)}
				>
					⚑
				</button>
				<span className="text-xs text-gray-400">
					{formatTimestamp(argument.createdAt)}
				</span>
			</div>

			{flagOpen && (
				<FlagPopover
					argumentId={argument.id}
					onClose={() => setFlagOpen(false)}
				/>
			)}
		</div>
	);
}
