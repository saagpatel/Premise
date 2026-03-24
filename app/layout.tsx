import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Premise — Structured Debate",
	description:
		"A debate platform where every argument must be categorized and linked to a specific parent claim.",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
