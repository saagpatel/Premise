"use client";

import clsx from "clsx";
import { useState } from "react";
import type { Debate, DebateStatus, Participant } from "@/types";

const STATUS_STYLES: Record<DebateStatus, string> = {
	open: "bg-blue-100 text-blue-800",
	in_progress: "bg-green-100 text-green-800",
	concluding: "bg-amber-100 text-amber-800",
	concluded: "bg-gray-100 text-gray-800",
	stalled: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<DebateStatus, string> = {
	open: "Open",
	in_progress: "In Progress",
	concluding: "Concluding",
	concluded: "Concluded",
	stalled: "Stalled",
};

function ParticipantSlot({
	participant,
	side,
	debateId,
}: {
	participant: Participant | undefined;
	side: "for" | "against";
	debateId: string;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopyInvite = async () => {
		const url = `${window.location.origin}/d/${debateId}?join=${side}`;
		await navigator.clipboard.writeText(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const displayName =
		participant?.user?.displayName ??
		participant?.user?.username ??
		"Anonymous";

	return (
		<div
			className={clsx(
				"flex-1 rounded-lg border p-4",
				side === "for"
					? "border-blue-200 bg-blue-50/50"
					: "border-orange-200 bg-orange-50/50",
			)}
		>
			<div
				className={clsx(
					"mb-1 text-xs font-bold uppercase tracking-wider",
					side === "for" ? "text-blue-600" : "text-orange-600",
				)}
			>
				{side === "for" ? "For" : "Against"}
			</div>
			{participant ? (
				<div className="text-sm font-medium text-gray-900">{displayName}</div>
			) : (
				<div className="space-y-2">
					<div className="text-sm italic text-gray-500">
						Waiting for opponent...
					</div>
					<button
						onClick={handleCopyInvite}
						className={clsx(
							"rounded px-3 py-1 text-xs font-medium transition-colors",
							"border border-gray-300 bg-white hover:bg-gray-50",
							"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
						)}
					>
						{copied ? "Copied!" : "Copy invite link"}
					</button>
				</div>
			)}
		</div>
	);
}

export function DebateHeader({
	debate,
	participants,
}: {
	debate: Debate;
	participants: Participant[];
}) {
	const forParticipant = participants.find((p) => p.side === "for");
	const againstParticipant = participants.find((p) => p.side === "against");

	return (
		<div className="w-full border-b border-gray-200 bg-white px-6 py-5">
			<div className="mb-4 flex items-start justify-between gap-4">
				<h1 className="text-2xl font-bold text-gray-900">{debate.claimText}</h1>
				<span
					className={clsx(
						"shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
						STATUS_STYLES[debate.status],
					)}
				>
					{STATUS_LABELS[debate.status]}
				</span>
			</div>
			<div className="flex gap-4">
				<ParticipantSlot
					participant={forParticipant}
					side="for"
					debateId={debate.id}
				/>
				<ParticipantSlot
					participant={againstParticipant}
					side="against"
					debateId={debate.id}
				/>
			</div>
		</div>
	);
}
