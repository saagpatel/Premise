"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ArgumentForm } from "@/components/debate/argument-form";
import { ArgumentTree } from "@/components/debate/argument-tree";
import { DebateHeader } from "@/components/debate/debate-header";
import { useDebate } from "@/components/debate/debate-provider";
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
		refreshDebate,
	} = useDebate();

	// Handle ?join=against (or ?join=for) query param
	useEffect(() => {
		const joinSide = searchParams.get("join");
		if (!joinSide || joinAttempted.current) return;
		if (joinSide !== "for" && joinSide !== "against") return;

		joinAttempted.current = true;

		(async () => {
			// Ensure anon identity exists
			await fetch("/api/auth/anon-id");

			const res = await fetch(`/api/debates/${debate.id}/join`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ side: joinSide }),
			});

			if (res.ok) {
				await refreshDebate();
			}

			// Remove query param
			router.replace(`/d/${debate.id}`);
		})();
	}, [searchParams, debate.id, refreshDebate, router]);

	const cruxId = findCrux(args);
	const hasOpponent = participants.length >= 2;

	return (
		<ToastProvider>
			<div className="flex h-screen flex-col bg-gray-50">
				<DebateHeader debate={debate} participants={participants} />

				<div className="flex flex-1 overflow-hidden">
					{/* Tree panel */}
					<div className="flex-1 overflow-hidden">
						<ArgumentTree arguments={args} cruxId={cruxId} />
					</div>

					{/* Form panel — only for participants */}
					{isParticipant && (
						<div className="w-[360px] shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-5">
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
