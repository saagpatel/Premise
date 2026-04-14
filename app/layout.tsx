import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
	title: "Premise — Structured Debate Platform",
	description:
		"An open-source debate platform where every argument is categorized, linked to claims, and voted on by spectators. Built with Next.js and Supabase.",
};

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const nonce = (await headers()).get("x-nonce") ?? undefined;

	return (
		<html lang="en" {...(nonce ? { nonce } : {})}>
			<body>
				<main>{children}</main>
			</body>
		</html>
	);
}
