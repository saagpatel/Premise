import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Premise — Structured Debate Platform",
	description:
		"An open-source debate platform where every argument is categorized, linked to claims, and voted on by spectators. Built with Next.js and Supabase.",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body>
				<main>{children}</main>
			</body>
		</html>
	);
}
