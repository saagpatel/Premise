"use client";

import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error";

interface Toast {
	id: string;
	message: string;
	type: ToastType;
}

interface ToastContextValue {
	toast: (opts: { message: string; type: ToastType }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within ToastProvider");
	return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);

	const toast = useCallback(
		({ message, type }: { message: string; type: ToastType }) => {
			const id = crypto.randomUUID();
			setToasts((prev) => [...prev, { id, message, type }]);

			setTimeout(() => {
				setToasts((prev) => prev.filter((t) => t.id !== id));
			}, 3000);
		},
		[],
	);

	const dismiss = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	return (
		<ToastContext.Provider value={{ toast }}>
			{children}
			<div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
				<AnimatePresence>
					{toasts.map((t) => (
						<motion.div
							key={t.id}
							initial={{ opacity: 0, y: 20, scale: 0.95 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, scale: 0.95 }}
							transition={{ duration: 0.2 }}
							className={clsx(
								"flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg",
								"min-w-[280px] max-w-sm",
								t.type === "success" &&
									"border border-emerald-200 bg-emerald-50 text-emerald-900",
								t.type === "error" &&
									"border border-red-200 bg-red-50 text-red-900",
							)}
						>
							<span className="flex-1 text-sm font-medium">{t.message}</span>
							<button
								onClick={() => dismiss(t.id)}
								className="text-current opacity-50 transition-opacity hover:opacity-100"
								aria-label="Dismiss"
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 14 14"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<path d="M1 1l12 12M13 1L1 13" />
								</svg>
							</button>
						</motion.div>
					))}
				</AnimatePresence>
			</div>
		</ToastContext.Provider>
	);
}
