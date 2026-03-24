"use client";

import clsx from "clsx";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { DebateFeedItem } from "@/app/api/debates/route";
import { UsernameModal } from "@/components/debate/username-modal";
import type { DebateStatus } from "@/types";

// Isolated component so useSearchParams doesn't suspend the whole page
function UsernameSetupGate() {
	const searchParams = useSearchParams();
	if (searchParams.get("setup") !== "username") return null;
	return <UsernameModal />;
}

// ── Status badge ──────────────────────────────────────────────────────

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

// ── DebateFeed ────────────────────────────────────────────────────────

function DebateFeed() {
	const router = useRouter();
	const [debates, setDebates] = useState<DebateFeedItem[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [hasMore, setHasMore] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setIsLoading(true);
			try {
				const res = await fetch("/api/debates?limit=20");
				if (!res.ok) return;
				const json = (await res.json()) as {
					debates: DebateFeedItem[];
					meta: { nextCursor: string | null; hasMore: boolean };
				};
				if (!cancelled) {
					setDebates(json.debates);
					setNextCursor(json.meta.nextCursor);
					setHasMore(json.meta.hasMore);
				}
			} catch (err) {
				console.error("Failed to load debate feed:", err);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}

		void load();
		return () => {
			cancelled = true;
		};
	}, []);

	async function loadMore() {
		if (!nextCursor || isLoadingMore) return;
		setIsLoadingMore(true);
		try {
			const res = await fetch(
				`/api/debates?limit=20&cursor=${encodeURIComponent(nextCursor)}`,
			);
			if (!res.ok) return;
			const json = (await res.json()) as {
				debates: DebateFeedItem[];
				meta: { nextCursor: string | null; hasMore: boolean };
			};
			setDebates((prev) => [...prev, ...json.debates]);
			setNextCursor(json.meta.nextCursor);
			setHasMore(json.meta.hasMore);
		} catch (err) {
			console.error("Failed to load more debates:", err);
		} finally {
			setIsLoadingMore(false);
		}
	}

	if (isLoading) {
		return (
			<div className="space-y-3" aria-label="Loading debates">
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						className="animate-pulse rounded-xl border border-gray-200 bg-white p-5"
					>
						<div className="mb-2 h-4 w-3/4 rounded bg-gray-200" />
						<div className="h-3 w-1/4 rounded bg-gray-100" />
					</div>
				))}
			</div>
		);
	}

	if (debates.length === 0) {
		return (
			<p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
				No debates yet. Start the first one!
			</p>
		);
	}

	return (
		<div className="space-y-3">
			{debates.map((debate) => {
				const truncated =
					debate.claimText.length > 120
						? `${debate.claimText.slice(0, 120)}...`
						: debate.claimText;

				return (
					<button
						key={debate.id}
						type="button"
						onClick={() => router.push(`/debate/${debate.id}`)}
						className="w-full rounded-xl border border-gray-200 bg-white p-5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
					>
						<div className="mb-2 flex items-start justify-between gap-3">
							<p className="text-sm font-medium text-gray-900 leading-snug">
								{truncated}
							</p>
							<span
								className={clsx(
									"shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
									STATUS_STYLES[debate.status],
								)}
							>
								{STATUS_LABELS[debate.status]}
							</span>
						</div>
						<p className="text-xs text-gray-400">
							{debate.argumentCount} argument
							{debate.argumentCount !== 1 ? "s" : ""} ·{" "}
							{debate.participantCount} participant
							{debate.participantCount !== 1 ? "s" : ""}
						</p>
					</button>
				);
			})}

			{hasMore && (
				<button
					type="button"
					onClick={() => void loadMore()}
					disabled={isLoadingMore}
					className={clsx(
						"mt-2 w-full rounded-lg py-2 text-sm font-medium transition-colors",
						"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
						isLoadingMore
							? "cursor-not-allowed text-gray-400"
							: "text-blue-600 hover:text-blue-700",
					)}
				>
					{isLoadingMore ? "Loading..." : "Load more"}
				</button>
			)}
		</div>
	);
}

// ── Landing page ──────────────────────────────────────────────────────

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
				setError(
					(data as { error?: string }).error ?? "Failed to create debate",
				);
				return;
			}

			const data = await res.json();
			// Creator goes to their debate (not the join URL)
			router.push(`/d/${(data as { id: string }).id}`);
		} catch {
			setError("Network error. Please try again.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<main className="flex min-h-screen flex-col items-center bg-gray-50 px-4 py-16">
			<Suspense fallback={null}>
				<UsernameSetupGate />
			</Suspense>
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

				<section className="mt-16 w-full">
					<h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
						Recent Debates
					</h2>
					<DebateFeed />
				</section>
			</div>
		</main>
	);
}
