"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import type { Argument, ArgumentType, ClassifyResponse } from "@/types";
import { ArgumentTypeSelector } from "./argument-type-selector";

function getCharCountColor(count: number): string {
	if (count >= 480) return "text-red-500";
	if (count >= 400) return "text-amber-500";
	return "text-gray-400";
}

function getArgumentDepth(
	arg: Argument,
	argsById: Map<string, Argument>,
): number {
	let depth = 0;
	let current = arg;
	while (current.parentArgumentId && argsById.has(current.parentArgumentId)) {
		depth++;
		current = argsById.get(current.parentArgumentId)!; // safe: checked has()
	}
	return Math.min(depth, 4);
}

function StepIndicator({ currentStep }: { currentStep: number }) {
	return (
		<div className="mb-6 flex items-center justify-center gap-2">
			{[1, 2, 3].map((step) => (
				<div key={step} className="flex items-center gap-2">
					<div
						className={clsx(
							"flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
							step === currentStep
								? "bg-blue-600 text-white"
								: step < currentStep
									? "bg-blue-100 text-blue-600"
									: "bg-gray-100 text-gray-400",
						)}
					>
						{step}
					</div>
					{step < 3 && (
						<div
							className={clsx(
								"h-px w-8",
								step < currentStep ? "bg-blue-300" : "bg-gray-200",
							)}
						/>
					)}
				</div>
			))}
		</div>
	);
}

interface AiSuggestion {
	suggestedType: ArgumentType | null;
	confidence: number;
}

export function ArgumentForm({
	debateId,
	arguments: existingArgs,
	onArgumentPosted,
}: {
	debateId: string;
	arguments: Argument[];
	onArgumentPosted: () => void;
}) {
	const { toast } = useToast();
	const [step, setStep] = useState(1);
	const [contentText, setContentText] = useState("");
	const [parentArgumentId, setParentArgumentId] = useState<string | null>(null);
	const [argumentType, setArgumentType] = useState<ArgumentType | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// AI classification state
	const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
	const [isClassifying, setIsClassifying] = useState(false);
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const abortControllerRef = useRef<AbortController | null>(null);

	const argsById = new Map(existingArgs.map((a) => [a.id, a]));

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (debounceTimerRef.current !== null) {
				clearTimeout(debounceTimerRef.current);
			}
			abortControllerRef.current?.abort();
		};
	}, []);

	function handleContentChange(value: string) {
		setContentText(value);

		// Cancel previous debounce + in-flight request
		if (debounceTimerRef.current !== null) {
			clearTimeout(debounceTimerRef.current);
		}
		abortControllerRef.current?.abort();

		if (value.length < 50) {
			setAiSuggestion(null);
			setIsClassifying(false);
			return;
		}

		debounceTimerRef.current = setTimeout(() => {
			void classifyArgument(value);
		}, 1000);
	}

	async function classifyArgument(text: string) {
		abortControllerRef.current = new AbortController();
		setIsClassifying(true);

		try {
			const res = await fetch("/api/classify-argument", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ contentText: text }),
				signal: abortControllerRef.current.signal,
			});

			if (!res.ok) {
				setAiSuggestion(null);
				return;
			}

			const data: ClassifyResponse = (await res.json()) as ClassifyResponse;
			setAiSuggestion(
				data.suggestedType !== null
					? { suggestedType: data.suggestedType, confidence: data.confidence }
					: null,
			);
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				// cancelled — not an error
				return;
			}
			// Non-abort errors: silently clear (classifier is optional)
			setAiSuggestion(null);
		} finally {
			setIsClassifying(false);
		}
	}

	// When AI suggestion arrives and no type is manually selected yet, pre-select it
	useEffect(() => {
		if (aiSuggestion?.suggestedType && argumentType === null) {
			setArgumentType(aiSuggestion.suggestedType);
		}
	}, [aiSuggestion, argumentType]);

	const handleSubmit = async () => {
		if (!argumentType || contentText.trim().length < 10) return;

		setIsSubmitting(true);
		try {
			const res = await fetch("/api/arguments", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					debateId,
					parentArgumentId,
					argumentType,
					contentText: contentText.trim(),
				}),
			});

			if (!res.ok) {
				const data: unknown = await res.json();
				const message =
					data !== null &&
					typeof data === "object" &&
					"error" in data &&
					typeof (data as Record<string, unknown>).error === "string"
						? (data as Record<string, unknown>).error
						: "Failed to post argument";
				toast({ message: message as string, type: "error" });
				return;
			}

			toast({ message: "Argument posted", type: "success" });
			setContentText("");
			setParentArgumentId(null);
			setArgumentType(null);
			setAiSuggestion(null);
			setStep(1);
			onArgumentPosted();
		} catch {
			toast({ message: "Network error", type: "error" });
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="flex h-full flex-col">
			<h2 className="mb-2 text-lg font-bold text-gray-900">Post Argument</h2>
			<StepIndicator currentStep={step} />

			{step === 1 && (
				<div className="flex flex-1 flex-col">
					<textarea
						value={contentText}
						onChange={(e) => handleContentChange(e.target.value)}
						maxLength={500}
						rows={5}
						placeholder="Write your argument..."
						className="flex-1 resize-none rounded-lg border border-gray-300 p-3 text-sm text-gray-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
					<div className="mt-1 min-h-[20px]">
						{isClassifying && (
							<span className="flex items-center gap-1.5 text-xs text-gray-400">
								<svg
									className="h-3 w-3 animate-spin"
									viewBox="0 0 24 24"
									fill="none"
								>
									<circle
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										strokeWidth="4"
										className="opacity-25"
									/>
									<path
										d="M4 12a8 8 0 018-8"
										stroke="currentColor"
										strokeWidth="4"
										className="opacity-75"
									/>
								</svg>
								Classifying…
							</span>
						)}
					</div>
					<div className="mt-1 flex items-center justify-between">
						<span
							className={clsx("text-xs", getCharCountColor(contentText.length))}
						>
							{contentText.length}/500
						</span>
						<button
							onClick={() => setStep(2)}
							disabled={contentText.trim().length < 10}
							className={clsx(
								"rounded-lg px-4 py-2 text-sm font-medium transition-colors",
								"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
								contentText.trim().length >= 10
									? "bg-blue-600 text-white hover:bg-blue-700"
									: "cursor-not-allowed bg-gray-100 text-gray-400",
							)}
						>
							Next &rarr;
						</button>
					</div>
				</div>
			)}

			{step === 2 && (
				<div className="flex flex-1 flex-col">
					<p className="mb-3 text-sm text-gray-600">
						What are you responding to?
					</p>
					<div className="flex-1 space-y-1 overflow-y-auto">
						<label
							className={clsx(
								"flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors",
								parentArgumentId === null
									? "border-blue-500 bg-blue-50"
									: "border-gray-200 hover:bg-gray-50",
							)}
						>
							<input
								type="radio"
								name="parent"
								checked={parentArgumentId === null}
								onChange={() => setParentArgumentId(null)}
								className="accent-blue-600"
							/>
							<span className="text-sm font-medium text-gray-900">
								The main claim
							</span>
						</label>
						{existingArgs.map((arg) => {
							const depth = getArgumentDepth(arg, argsById);
							return (
								<label
									key={arg.id}
									className={clsx(
										"flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition-colors",
										parentArgumentId === arg.id
											? "border-blue-500 bg-blue-50"
											: "border-gray-200 hover:bg-gray-50",
									)}
									style={{ paddingLeft: `${12 + depth * 16}px` }}
								>
									<input
										type="radio"
										name="parent"
										checked={parentArgumentId === arg.id}
										onChange={() => setParentArgumentId(arg.id)}
										className="accent-blue-600"
									/>
									<span
										className={clsx(
											"mr-1 rounded px-1.5 py-0.5 text-xs font-medium capitalize",
											arg.side === "for"
												? "bg-blue-100 text-blue-700"
												: "bg-orange-100 text-orange-700",
										)}
									>
										{arg.argumentType}
									</span>
									<span className="truncate text-sm text-gray-700">
										{arg.contentText.length > 50
											? `${arg.contentText.slice(0, 50)}\u2026`
											: arg.contentText}
									</span>
								</label>
							);
						})}
					</div>
					<div className="mt-3 flex justify-between">
						<button
							onClick={() => setStep(1)}
							className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
						>
							&larr; Back
						</button>
						<button
							onClick={() => setStep(3)}
							className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
						>
							Next &rarr;
						</button>
					</div>
				</div>
			)}

			{step === 3 && (
				<div className="flex flex-1 flex-col">
					<p className="mb-3 text-sm text-gray-600">
						What type of argument is this?
					</p>
					<div className="flex-1 overflow-y-auto">
						<ArgumentTypeSelector
							selected={argumentType}
							onSelect={(type) => {
								setArgumentType(type);
								// Selecting a different type clears the AI suggestion label
								if (type !== aiSuggestion?.suggestedType) {
									setAiSuggestion(null);
								}
							}}
							aiSuggestedType={aiSuggestion?.suggestedType ?? null}
						/>
					</div>
					<div className="mt-3 flex justify-between">
						<button
							onClick={() => setStep(2)}
							className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
						>
							&larr; Back
						</button>
						<button
							onClick={handleSubmit}
							disabled={!argumentType || isSubmitting}
							className={clsx(
								"rounded-lg px-6 py-2 text-sm font-medium transition-colors",
								"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
								argumentType && !isSubmitting
									? "bg-blue-600 text-white hover:bg-blue-700"
									: "cursor-not-allowed bg-gray-100 text-gray-400",
							)}
						>
							{isSubmitting ? (
								<span className="flex items-center gap-2">
									<svg
										className="h-4 w-4 animate-spin"
										viewBox="0 0 24 24"
										fill="none"
									>
										<circle
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="4"
											className="opacity-25"
										/>
										<path
											d="M4 12a8 8 0 018-8"
											stroke="currentColor"
											strokeWidth="4"
											className="opacity-75"
										/>
									</svg>
									Posting...
								</span>
							) : (
								"Submit"
							)}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
