"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UsernameModal() {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const validate = (value: string): string | null => {
		if (value.length < 3 || value.length > 20) {
			return "Username must be between 3 and 20 characters";
		}
		if (!/^[a-zA-Z0-9_]+$/.test(value)) {
			return "Only letters, numbers, and underscores are allowed";
		}
		return null;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (isSubmitting) return;

		const validationError = validate(username);
		if (validationError) {
			setError(validationError);
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			const res = await fetch("/api/users/username", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username }),
			});

			if (res.ok) {
				router.replace("/");
				return;
			}

			if (res.status === 409) {
				setError("Username already taken");
				return;
			}

			setError("Failed to set username. Try again.");
		} catch {
			setError("Failed to set username. Try again.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
			aria-modal="true"
			role="dialog"
			aria-labelledby="username-modal-title"
		>
			<div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
				<h2
					id="username-modal-title"
					className="text-2xl font-extrabold tracking-tight text-gray-900"
				>
					Welcome to Premise
				</h2>
				<p className="mt-2 text-sm font-light text-gray-500">
					Choose a username to save your debates.
				</p>

				<form onSubmit={handleSubmit} className="mt-6">
					<label
						htmlFor="username"
						className="mb-2 block text-sm font-semibold text-gray-700"
					>
						Username
					</label>
					<input
						id="username"
						type="text"
						value={username}
						onChange={(e) => {
							setUsername(e.target.value);
							if (error) setError(null);
						}}
						maxLength={20}
						placeholder="e.g. socrates_42"
						autoFocus
						autoComplete="off"
						className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>

					<div className="mt-1 flex items-center justify-between">
						<span className="text-xs text-gray-400">
							Letters, numbers, underscores only
						</span>
						<span
							className={clsx(
								"text-xs",
								username.length > 18
									? "text-red-500"
									: username.length > 15
										? "text-amber-500"
										: "text-gray-400",
							)}
						>
							{username.length}/20
						</span>
					</div>

					{error && (
						<p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
							{error}
						</p>
					)}

					<button
						type="submit"
						disabled={isSubmitting || username.length < 3}
						className={clsx(
							"mt-6 w-full rounded-lg px-6 py-3 text-sm font-bold transition-colors",
							"focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
							!isSubmitting && username.length >= 3
								? "bg-blue-600 text-white hover:bg-blue-700"
								: "cursor-not-allowed bg-gray-100 text-gray-400",
						)}
					>
						{isSubmitting ? "Setting username..." : "Set Username"}
					</button>
				</form>
			</div>
		</div>
	);
}
