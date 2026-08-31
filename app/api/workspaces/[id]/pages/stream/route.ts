import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

// Poll every 4s (cheaper than notifications' 10s since this is a single indexed
// MAX() aggregate); heartbeat every 25s since the client auto-reconnects on idle teardown.
const POLL_INTERVAL_MS = 4000;
const HEARTBEAT_MS = 25_000;
const MAX_DURATION_MS = 55_000;

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/workspaces/:id/pages/stream
// Watches MAX(updated_at) instead of tracking individual mutations; client does a full
// tree refetch on the bare "changed" nudge (no payload).
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const session = await getSession();
    await requireWorkspaceMember(workspaceId, session.user.id);

    const encoder = new TextEncoder();

    async function currentMax(): Promise<number> {
      const [row] = await db
        .select({ maxUpdated: sql<string | null>`max(${pages.updatedAt})` })
        .from(pages)
        .where(
          and(
            eq(pages.workspaceId, workspaceId),
            // A creator's own draft edits still nudge their own other tabs;
            // other users' still-drafts never trigger a refetch for anyone else.
            or(eq(pages.isDraft, false), eq(pages.createdBy, session.user.id))
          )
        );
      return row?.maxUpdated ? new Date(row.maxUpdated).getTime() : 0;
    }

    let lastMax = await currentMax();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
              )
            );
          } catch {
            // client disconnected
          }
        };

        send("connected", { ok: true });

        const deadline = Date.now() + MAX_DURATION_MS;
        let heartbeatTimer: ReturnType<typeof setTimeout> | undefined;

        const heartbeat = () => {
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            /* client gone */
          }
          if (Date.now() < deadline) {
            heartbeatTimer = setTimeout(heartbeat, HEARTBEAT_MS);
          }
        };
        heartbeatTimer = setTimeout(heartbeat, HEARTBEAT_MS);

        const poll = async () => {
          if (req.signal.aborted || Date.now() >= deadline) {
            clearTimeout(heartbeatTimer);
            try {
              controller.close();
            } catch {
              /* already closed */
            }
            return;
          }

          try {
            const max = await currentMax();
            if (max !== lastMax) {
              lastMax = max;
              send("changed", { ok: true });
            }
          } catch {
            // DB error — keep streaming, retry next poll
          }

          setTimeout(poll, POLL_INTERVAL_MS);
        };

        setTimeout(poll, POLL_INTERVAL_MS);

        req.signal.addEventListener("abort", () => {
          clearTimeout(heartbeatTimer);
          try {
            controller.close();
          } catch {
            /* ok */
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[GET /api/workspaces/:id/pages/stream]", err);
    return apiError(500, "Internal error");
  }
}
