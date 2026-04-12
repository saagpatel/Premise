"use client";

import clsx from "clsx";
import type { ArgumentType } from "@/types";

interface TypeInfo {
	type: ArgumentType;
	label: string;
	description: string;
	example: string;
}

const ARGUMENT_TYPES: TypeInfo[] = [
	{
		type: "evidence",
		label: "Evidence",
		description: "An empirical fact, study, or data point.",
		example: "A 2023 meta-analysis of 40 studies found\u2026",
	},
	{
		type: "analogy",
		label: "Analogy",
		description: "A comparison to a similar situation.",
		example:
			"This is like arguing that cars should be banned because some drivers speed.",
	},
	{
		type: "counterexample",
		label: "Counterexample",
		description: "A specific case that contradicts the claim.",
		example: "Japan has strict gun laws and one of the lowest homicide rates.",
	},
	{
		type: "reductio",
		label: "Reductio",
		description:
			"Show the opponent\u2019s logic leads to an absurd conclusion.",
		example: "By that logic, we should also ban knives.",
	},
	{
		type: "authority",
		label: "Authority",
		description: "Cite an expert or institution.",
		example: "The WHO recommends\u2026",
	},
	{
		type: "concession",
		label: "Concession",
		description: "Acknowledge a valid point from the other side.",
		example: "You\u2019re right that correlation \u2260 causation here.",
	},
	{
		type: "clarification",
		label: "Clarification",
		description: "Ask for or provide clarification on a specific claim.",
		example: 'What do you mean by "most" in this context?',
	},
];

export function ArgumentTypeSelector({
	selected,
	onSelect,
	aiSuggestedType = null,
}: {
	selected: ArgumentType | null;
	onSelect: (type: ArgumentType | null) => void;
	aiSuggestedType?: ArgumentType | null;
}) {
	return (
		<div className="grid grid-cols-2 gap-3">
			{ARGUMENT_TYPES.map((info, i) => (
				<button
					key={info.type}
					type="button"
					onClick={() => onSelect(selected === info.type ? null : info.type)}
					className={clsx(
						"rounded-lg border p-4 text-left transition-all",
						"hover:border-blue-300 hover:shadow-sm",
						"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
						selected === info.type
							? "border-blue-500 bg-blue-50 ring-2 ring-blue-500"
							: "border-gray-200 bg-white",
						// Last card spans full width if odd count
						i === ARGUMENT_TYPES.length - 1 &&
							ARGUMENT_TYPES.length % 2 !== 0 &&
							"col-span-2",
					)}
				>
					<div className="flex items-center gap-2">
						<span className="font-semibold text-gray-900">{info.label}</span>
						{selected === info.type && aiSuggestedType === info.type && (
							<span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700">
								AI suggested
							</span>
						)}
					</div>
					<div className="mt-1 text-sm text-gray-600">{info.description}</div>
					<div className="mt-1 text-sm italic text-gray-400">
						{info.example}
					</div>
				</button>
			))}
		</div>
	);
}
