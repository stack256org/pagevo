import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Unauthenticated liveness/readiness probe for container orchestrators
// (Docker healthcheck, Kubernetes probes, uptime monitors). Confirms the
// app process is up and can reach the database.
//
// `version` reports which build a container is running — stamped at image
// build time via the APP_VERSION build arg (see Dockerfile, release.yml),
// or "dev" for a local, non-Docker build.
export async function GET() {
  const version = process.env.APP_VERSION ?? "dev";
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok", database: "ok", version });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        database: "unreachable",
        version,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
