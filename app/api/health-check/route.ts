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

	// Preferred path: one SECURITY DEFINER RPC created by supabase/seed.sql that
	// reads the catalogs directly. PostgREST cannot expose information_schema,
	// pg_tables or pg_publication_tables, so the legacy probes below always
	// failed — and their fallbacks reported RLS as healthy simply because the
	// check had errored. A check that cannot fail is not a check.
	const { data: health, error: healthError } = await supabase.rpc(
		"premise_health" as string,
	);

	if (!healthError && health) {
		const h = health as {
			tables: string[];
			rls_disabled: string[];
			realtime: string[];
		};

		const existing = new Set(h.tables ?? []);
		result.missingTables = EXPECTED_TABLES.filter((t) => !existing.has(t));
		if (result.missingTables.length > 0) {
			result.tablesExist = false;
			result.errors.push(
				`Missing tables: ${result.missingTables.join(", ")}. Run: psql $DATABASE_URL -f supabase/seed.sql`,
			);
		}

		if ((h.rls_disabled ?? []).length > 0) {
			result.rlsEnabled = false;
			result.errors.push(`RLS not enabled on: ${h.rls_disabled.join(", ")}`);
		}

		const published = new Set(h.realtime ?? []);
		const missingRealtime = REALTIME_TABLES.filter((t) => !published.has(t));
		if (missingRealtime.length > 0) {
			result.realtimeEnabled = false;
			result.errors.push(
				`Realtime not enabled on: ${missingRealtime.join(", ")}. Re-run supabase/seed.sql, which adds them to the supabase_realtime publication.`,
			);
		}

		return NextResponse.json(result);
	}

	// Fallback for a database seeded before premise_health() existed. It can
	// still confirm tables by probing them, but it cannot see RLS or realtime,
	// and says so instead of assuming they are fine.
	result.errors.push(
		"premise_health() not found — re-run supabase/seed.sql to enable full verification. Falling back to table probes.",
	);

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
		// pg_tables is not exposed via PostgREST. Report this as unverified
		// rather than healthy — reporting `true` here made an unrunnable check
		// indistinguishable from a passing one.
		result.rlsEnabled = false;
		result.errors.push(
			"Could not verify RLS status. Re-run supabase/seed.sql so premise_health() exists, or check Supabase Studio → Database → Tables.",
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
