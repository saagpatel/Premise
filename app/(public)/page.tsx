"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LandingPage() {
	const router = useRouter();
	const [claimText, setClaimText] = useState("");
	const [visibility, setVisibility] = useState<"public" | "private">("public");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const charCount = claimText.length;
	const canSubmit = claimText.trim().length >= 1 && charCount <= 280;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!canSubmit || isSubmitting) return;

		setIsSubmitting(true);
		setError(null);

		try {
			// Ensure anonymous identity exists
			await fetch("/api/auth/anon-id");

			const res = await fetch("/api/debates", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ claimText: claimText.trim(), visibility }),
			});

			if (!res.ok) {
				const data = await res.json();
				setError(data.error ?? "Failed to create debate");
				return;
			}

			const data = await res.json();
			// Creator goes to their debate (not the join URL)
			router.push(`/d/${data.id}`);
		} catch {
			setError("Network error. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
			<div className="w-full max-w-xl">
				<div className="mb-12 text-center">
					<h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
						Premise
					</h1>
					<p className="mt-3 text-lg font-light text-gray-500">
						Structured debate, visualized.
					</p>
				</div>

				<form
					onSubmit={handleSubmit}
					className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm"
				>
					<label
						htmlFor="claim"
						className="mb-2 block text-sm font-semibold text-gray-700"
					>
						Start a Debate
					</label>
					<textarea
						id="claim"
						value={claimText}
						onChange={(e) => setClaimText(e.target.value)}
						maxLength={280}
						rows={3}
						placeholder="State your claim..."
						className="w-full resize-none rounded-lg border border-gray-300 p-4 text-gray-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
					<div className="mt-2 flex items-center justify-between">
						<span
							className={clsx(
								"text-xs",
								charCount > 260
									? "text-red-500"
									: charCount > 220
										? "text-amber-500"
										: "text-gray-400",
							)}
						>
							{charCount}/280
						</span>

						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() =>
									setVisibility(visibility === "public" ? "private" : "public")
								}
								className={clsx(
									"rounded-full px-3 py-1 text-xs font-medium transition-colors",
									"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
									visibility === "public"
										? "bg-green-100 text-green-700"
										: "bg-gray-100 text-gray-600",
								)}
							>
								{visibility === "public" ? "Public" : "Private"}
							</button>
						</div>
					</div>

					{error && (
						<p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
							{error}
						</p>
					)}

					<button
						type="submit"
						disabled={!canSubmit || isSubmitting}
						className={clsx(
							"mt-6 w-full rounded-lg px-6 py-3 text-sm font-bold transition-colors",
							"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
							canSubmit && !isSubmitting
								? "bg-blue-600 text-white hover:bg-blue-700"
								: "cursor-not-allowed bg-gray-100 text-gray-400",
						)}
					>
						{isSubmitting ? "Creating..." : "Start Debate"}
					</button>
				</form>
			</div>
		</main>
	);
}
