"use client";

import clsx from "clsx";
import type { VoteValue } from "@/types";

type Props = {
	argumentId: string;
	currentScore: number;
	isParticipant: boolean;
	hasVoted: boolean;
	onVote: (vote: VoteValue) => void;
};

function ThumbUpIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M2 20h2a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H2v10zm19.83-7.12A2 2 0 0 0 20 10h-6V7a3 3 0 0 0-3-3l-1 5.72L8.5 12H5v7h13a2 2 0 0 0 1.97-1.66l1-6a2 2 0 0 0-.14-.46z" />
		</svg>
	);
}

function ThumbDownIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M22 4h-2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2V4zm-19.83 7.12A2 2 0 0 0 4 14h6v3a3 3 0 0 0 3 3l1-5.72L15.5 12H19V5H6a2 2 0 0 0-1.97 1.66l-1 6a2 2 0 0 0 .14.46z" />
		</svg>
	);
}

export function VotingControls({
	argumentId: _argumentId,
	currentScore,
	isParticipant,
	hasVoted,
	onVote,
}: Props) {
	const disabled = isParticipant || hasVoted;

	return (
		<div className="flex flex-col items-center gap-1">
			<div className="flex items-center gap-3">
				<button
					onClick={() => !disabled && onVote("strong")}
					disabled={disabled}
					aria-label="Vote strong"
					className={clsx(
						"flex items-center justify-center rounded p-1.5 transition-colors",
						"focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1",
						disabled
							? "cursor-not-allowed opacity-50 text-gray-400"
							: "cursor-pointer text-gray-500 hover:bg-green-50 hover:text-green-600",
					)}
				>
					<ThumbUpIcon />
				</button>

				<span className="min-w-[2rem] text-center text-sm font-semibold text-gray-700">
					{currentScore > 0 ? `+${currentScore}` : currentScore}
				</span>

				<button
					onClick={() => !disabled && onVote("weak")}
					disabled={disabled}
					aria-label="Vote weak"
					className={clsx(
						"flex items-center justify-center rounded p-1.5 transition-colors",
						"focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1",
						disabled
							? "cursor-not-allowed opacity-50 text-gray-400"
							: "cursor-pointer text-gray-500 hover:bg-red-50 hover:text-red-600",
					)}
				>
					<ThumbDownIcon />
				</button>
			</div>

			{isParticipant && (
				<p className="text-xs text-gray-400">Participants can&apos;t vote</p>
			)}
			{!isParticipant && hasVoted && (
				<p className="text-xs text-gray-400">Voted</p>
			)}
		</div>
	);
}
