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

// ── Animated Mini Debate Tree ─────────────────────────────────────────

function DebateTreeSVG() {
	// Node positions within a 280×200 viewBox
	// Root: center-top, children spread below, grandchildren below each child
	const nodes = [
		{ id: "root", cx: 140, cy: 32, fill: "#1E293B", delay: "0s" },
		{ id: "for", cx: 72, cy: 96, fill: "#3B82F6", delay: "0.2s" },
		{ id: "agt", cx: 208, cy: 96, fill: "#F97316", delay: "0.4s" },
		{ id: "gc1", cx: 48, cy: 168, fill: "#3B82F6", delay: "0.6s" },
		{ id: "gc2", cx: 208, cy: 168, fill: "#F97316", delay: "0.8s" },
	] as const;

	// Cubic bezier edges: root→for, root→against, for→gc1, against→gc2
	const edges = [
		// root → for
		`M 140 44 C 140 70, 72 70, 72 84`,
		// root → against
		`M 140 44 C 140 70, 208 70, 208 84`,
		// for → gc1
		`M 72 108 C 72 138, 48 138, 48 156`,
		// against → gc2
		`M 208 108 C 208 138, 208 138, 208 156`,
	];

	return (
		<svg
			width="280"
			height="200"
			viewBox="0 0 280 200"
			aria-hidden="true"
			className="overflow-visible"
		>
			{/* Edges drawn first so they sit behind nodes */}
			{edges.map((d, i) => (
				<path
					key={i}
					d={d}
					fill="none"
					stroke="#94A3B8"
					strokeWidth="1.5"
					strokeLinecap="round"
					style={{
						opacity: 0,
						animation: `nodeAppear 0.3s ease-out forwards`,
						animationDelay: `${i * 0.2 + 0.1}s`,
					}}
				/>
			))}

			{/* Nodes */}
			{nodes.map((n) => (
				<circle
					key={n.id}
					cx={n.cx}
					cy={n.cy}
					r={12}
					fill={n.fill}
					className="node-appear"
					style={{ animationDelay: n.delay }}
				/>
			))}
		</svg>
	);
}

// ── How It Works ──────────────────────────────────────────────────────

const HOW_IT_WORKS_STEPS = [
	{
		number: "1",
		title: "Start with a claim",
		description: "Stake your position in 280 characters or less.",
	},
	{
		number: "2",
		title: "Structure your arguments",
		description:
			"Every response must be categorized: evidence, analogy, counterexample, and more.",
	},
	{
		number: "3",
		title: "Watch the tree grow",
		description: "See the debate unfold as a live, interactive argument tree.",
	},
] as const;

function HowItWorksSection() {
	return (
		<section className="w-full border-t border-gray-200 py-16 px-4">
			<div className="mx-auto max-w-3xl">
				<div className="grid grid-cols-1 gap-8 md:grid-cols-3">
					{HOW_IT_WORKS_STEPS.map((step) => (
						<div key={step.number} className="flex flex-col gap-2">
							<span className="text-4xl font-black text-blue-600 leading-none">
								{step.number}
							</span>
							<h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
							<p className="text-sm text-gray-500 leading-relaxed">
								{step.description}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}

// ── Self-Host Section ─────────────────────────────────────────────────

const INSTALL_COMMANDS = `git clone https://github.com/your-org/premise.git
cd premise && npm install
cp .env.example .env.local
psql $DATABASE_URL -f supabase/seed.sql
npm run dev
curl localhost:3000/api/health-check`;

function SelfHostSection() {
	return (
		<section className="w-full border-t border-gray-200 py-16 px-4">
			<div className="mx-auto max-w-xl">
				<h2 className="text-2xl font-extrabold tracking-tight text-gray-900">
					Self-Host in 10 Minutes
				</h2>
				<p className="mt-2 text-sm text-gray-500">
					Premise is open source. Bring your own Supabase project.
				</p>

				<div className="mt-6 rounded-xl bg-gray-900 p-6 overflow-x-auto">
					<pre className="text-sm text-gray-100 leading-relaxed font-mono whitespace-pre">
						{INSTALL_COMMANDS}
					</pre>
				</div>

				<div className="mt-4">
					<a
						href="#"
						className="text-blue-600 hover:text-blue-700 font-medium text-sm transition-colors"
					>
						View on GitHub →
					</a>
				</div>
			</div>
		</section>
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
		<main className="flex min-h-screen flex-col items-center bg-gray-50">
			<Suspense fallback={null}>
				<UsernameSetupGate />
			</Suspense>

			{/* ── Hero ── */}
			<section className="flex w-full flex-col items-center px-4 pt-20 pb-16 text-center">
				<DebateTreeSVG />
				<h1 className="mt-8 text-5xl font-extrabold tracking-tight text-gray-900">
					Premise
				</h1>
				<p className="mt-3 text-lg font-light text-gray-500">
					Structured debate, visualized.
				</p>
			</section>

			{/* ── How It Works ── */}
			<HowItWorksSection />

			{/* ── Self-Host ── */}
			<SelfHostSection />

			{/* ── Start a Debate + Recent Debates ── */}
			<section className="w-full border-t border-gray-200 py-16 px-4">
				<div className="mx-auto w-full max-w-xl">
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
										setVisibility(
											visibility === "public" ? "private" : "public",
										)
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
			</section>
		</main>
	);
}
