import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, pages, users, workspaceMembers } from "@/lib/db/schema";
import { notificationScope } from "@/lib/notifications/scope";
import { apiError, getSession } from "@/lib/workspaces/auth";

// Long-poll interval: poll every 3s, keeping connection alive with heartbeats every 25s.
// NOTE: this requires a persistent-connection host (Railway/VM). On Vercel, connections will
// be terminated by the serverless function timeout — the client auto-reconnects via EventSource.
const POLL_INTERVAL_MS = 3000;
const HEARTBEAT_MS = 25_000;
const MAX_DURATION_MS = 55_000; // stay under 60s to be safe on most hosts

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const session = await getSession();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    if (!workspaceId) {
      return apiError(400, "workspaceId required");
    }

    let lastSeen = new Date();
    const encoder = new TextEncoder();

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

        // Send initial connection confirmation
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
            const newRows = await db
              .select({
                id: notifications.id,
                type: notifications.type,
                isRead: notifications.isRead,
                createdAt: notifications.createdAt,
                contentSnippet: notifications.contentSnippet,
                pageId: notifications.pageId,
                sourceId: notifications.sourceId,
                senderId: notifications.senderId,
                senderName: users.name,
                senderImage: users.image,
                pageTitle: pages.title,
                pageIcon: pages.icon,
                pageShortId: pages.shortId,
                inviteToken: workspaceMembers.inviteToken,
              })
              .from(notifications)
              .leftJoin(users, eq(users.id, notifications.senderId))
              .leftJoin(pages, eq(pages.id, notifications.pageId))
              .leftJoin(
                workspaceMembers,
                eq(workspaceMembers.id, notifications.sourceId)
              )
              .where(
                and(
                  notificationScope(session.user.id, workspaceId),
                  gt(notifications.createdAt, lastSeen)
                )
              )
              .orderBy(desc(notifications.createdAt))
              .limit(20);

            if (newRows.length > 0) {
              lastSeen = newRows[0]!.createdAt;
              send("notifications", newRows);
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
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    console.error("[GET /api/notifications/stream]", e);
    return apiError(500, "Internal error");
  }
}
