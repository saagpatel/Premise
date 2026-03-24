"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArgumentForm } from "@/components/debate/argument-form";
import { ArgumentTree } from "@/components/debate/argument-tree";
import { DebateHeader } from "@/components/debate/debate-header";
import { useDebate } from "@/components/debate/debate-provider";
import { ThreadView } from "@/components/debate/thread-view";
import { ToastProvider } from "@/components/ui/toast";
import { findCrux } from "@/lib/crux-finder";

export default function DebateRoom() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const joinAttempted = useRef(false);

	const {
		debate,
		participants,
		arguments: args,
		isParticipant,
		connectionState,
		refreshDebate,
	} = useDebate();

	// Default: tree on desktop, thread on mobile
	const [viewMode, setViewMode] = useState<"tree" | "thread">("tree");

	useEffect(() => {
		const mq = window.matchMedia("(max-width: 768px)");
		if (mq.matches) setViewMode("thread");

		const handler = (e: MediaQueryListEvent) =>
			setViewMode(e.matches ? "thread" : "tree");
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);

	const toggleView = useCallback(
		() => setViewMode((v) => (v === "tree" ? "thread" : "tree")),
		[],
	);

	// Handle ?join=against (or ?join=for) query param
	useEffect(() => {
		const joinSide = searchParams.get("join");
		if (!joinSide || joinAttempted.current) return;
		if (joinSide !== "for" && joinSide !== "against") return;

		joinAttempted.current = true;

		(async () => {
			await fetch("/api/auth/anon-id");

			const res = await fetch(`/api/debates/${debate.id}/join`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ side: joinSide }),
			});

			if (res.ok) {
				await refreshDebate();
			}

			router.replace(`/d/${debate.id}`);
		})();
	}, [searchParams, debate.id, refreshDebate, router]);

	const cruxId = findCrux(args);
	const hasOpponent = participants.length >= 2;

	return (
		<ToastProvider>
			<div className="flex h-screen flex-col bg-gray-50">
				<DebateHeader
					debate={debate}
					participants={participants}
					connectionState={connectionState}
					viewMode={viewMode}
					onToggleView={toggleView}
				/>

				<div className="flex flex-1 overflow-hidden">
					{/* Main panel — tree or thread */}
					<div className="flex-1 overflow-hidden">
						{viewMode === "tree" ? (
							<ArgumentTree arguments={args} cruxId={cruxId} />
						) : (
							<ThreadView arguments={args} cruxId={cruxId} />
						)}
					</div>

					{/* Form panel — only for participants */}
					{isParticipant && (
						<div className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-5 md:block">
							{hasOpponent ? (
								<ArgumentForm
									debateId={debate.id}
									arguments={args}
									onArgumentPosted={refreshDebate}
								/>
							) : (
								<div className="flex h-full items-center justify-center">
									<p className="text-center text-sm text-gray-400">
										Waiting for opponent to join...
									</p>
								</div>
							)}
						</div>
					)}
				</div>
			</div>
		</ToastProvider>
	);
}
