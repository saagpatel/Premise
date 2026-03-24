"use client";

import clsx from "clsx";
import type { ConnectionState } from "@/types";

type Props = {
	connectionState: ConnectionState;
};

const CONFIG: Record<
	ConnectionState,
	{ dotClass: string; labelClass: string; label: string }
> = {
	live: {
		dotClass: "bg-green-500 animate-pulse",
		labelClass: "text-green-700",
		label: "Live",
	},
	reconnecting: {
		dotClass: "bg-amber-500 animate-pulse",
		labelClass: "text-amber-700",
		label: "Reconnecting",
	},
	paused: {
		dotClass: "bg-gray-400",
		labelClass: "text-gray-500",
		label: "Paused",
	},
};

export function LiveBadge({ connectionState }: Props) {
	const { dotClass, labelClass, label } = CONFIG[connectionState];

	return (
		<span className="flex items-center gap-1.5">
			<span
				className={clsx("h-2 w-2 rounded-full", dotClass)}
				aria-hidden="true"
			/>
			<span className={clsx("text-xs font-medium", labelClass)}>{label}</span>
		</span>
	);
}
