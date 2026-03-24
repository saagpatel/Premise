import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { HealthCheckResult } from "@/types";

const EXPECTED_TABLES = [
	"users",
	"debates",
	"participants",
	"arguments",
	"votes",
	"invitations",
	"flags",
] as const;

const REALTIME_TABLES = ["arguments", "votes"] as const;

/**
 * GET /api/health-check
 * Validates Supabase schema: tables exist, RLS enabled, Realtime configured.
 * Used by self-hosters to verify their setup after running seed.sql.
 */
export async function GET() {
	const result: HealthCheckResult = {
		tablesExist: true,
		realtimeEnabled: true,
		rlsEnabled: true,
		missingTables: [],
		errors: [],
	};

	let supabase;
	try {
		supabase = createServiceRoleClient();
	} catch (err) {
		const message = err instanceof Error ? err.message : "Unknown error";
		return NextResponse.json({
			tablesExist: false,
			realtimeEnabled: false,
			rlsEnabled: false,
			missingTables: [...EXPECTED_TABLES],
			errors: [`Supabase connection failed: ${message}`],
		} satisfies HealthCheckResult);
	}

	// Check which tables exist
	const { data: tables, error: tablesError } = await supabase
		.from("information_schema.tables" as string)
		.select("table_name")
		.eq("table_schema", "public")
		.in("table_name", [...EXPECTED_TABLES]);

	if (tablesError) {
		// information_schema may not be queryable via PostgREST — use RPC fallback
		const { data: rpcTables, error: rpcError } = await supabase.rpc(
			"get_premise_tables" as string,
		);

		if (rpcError) {
			// Direct SQL query via Supabase's built-in SQL endpoint
			result.errors.push(
				"Could not query table list. Falling back to individual table checks.",
			);

			for (const table of EXPECTED_TABLES) {
				const { error: probeError } = await supabase
					.from(table)
					.select("*", { count: "exact", head: true });

				if (probeError) {
					result.missingTables.push(table);
				}
			}
		} else {
			const existingNames = new Set(
				(rpcTables as Array<{ table_name: string }>).map((t) => t.table_name),
			);
			for (const table of EXPECTED_TABLES) {
				if (!existingNames.has(table)) {
					result.missingTables.push(table);
				}
			}
		}
	} else {
		const existingNames = new Set(
			(tables ?? []).map((t: { table_name: string }) => t.table_name),
		);
		for (const table of EXPECTED_TABLES) {
			if (!existingNames.has(table)) {
				result.missingTables.push(table);
			}
		}
	}

	if (result.missingTables.length > 0) {
		result.tablesExist = false;
		result.errors.push(
			`Missing tables: ${result.missingTables.join(", ")}. Run: psql $DATABASE_URL -f supabase/seed.sql`,
		);
	}

	// Check RLS via pg_tables (requires service role)
	const { data: pgTables, error: rlsError } = await supabase
		.from("pg_tables" as string)
		.select("tablename, rowsecurity")
		.eq("schemaname", "public")
		.in("tablename", [...EXPECTED_TABLES]);

	if (rlsError) {
		// pg_tables may not be exposed via PostgREST — probe each table
		result.errors.push(
			"Could not verify RLS status directly. Ensure RLS is enabled on all tables via Supabase Studio.",
		);
	} else {
		const tablesWithoutRls = (pgTables ?? [])
			.filter(
				(t: { tablename: string; rowsecurity: boolean }) => !t.rowsecurity,
			)
			.map((t: { tablename: string }) => t.tablename);

		if (tablesWithoutRls.length > 0) {
			result.rlsEnabled = false;
			result.errors.push(`RLS not enabled on: ${tablesWithoutRls.join(", ")}`);
		}
	}

	// Check Realtime publication
	const { data: pubTables, error: pubError } = await supabase
		.from("pg_publication_tables" as string)
		.select("tablename")
		.eq("pubname", "supabase_realtime");

	if (pubError) {
		result.errors.push(
			"Could not verify Realtime status. Ensure Realtime is enabled on 'arguments' and 'votes' tables in Supabase Studio → Database → Replication.",
		);
		result.realtimeEnabled = false;
	} else {
		const realtimeNames = new Set(
			(pubTables ?? []).map((t: { tablename: string }) => t.tablename),
		);
		const missingRealtime = REALTIME_TABLES.filter(
			(t) => !realtimeNames.has(t),
		);
		if (missingRealtime.length > 0) {
			result.realtimeEnabled = false;
			result.errors.push(
				`Realtime not enabled on: ${missingRealtime.join(", ")}. Enable in Supabase Studio → Database → Replication.`,
			);
		}
	}

	return NextResponse.json(result);
}
