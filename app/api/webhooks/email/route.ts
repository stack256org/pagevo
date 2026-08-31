import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export async function POST(request: Request) {
  if (!env.EMAIL_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "EMAIL_WEBHOOK_SECRET is not configured" },
      { status: 503 }
    );
  }
  if (!isValidWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Email event tracking removed in Phase 1 schema cleanup.
  return NextResponse.json({ ok: true });
}

function isValidWebhookSecret(request: Request) {
  const authorization = request.headers.get("authorization");
  const candidates = [
    request.headers.get("x-webhook-secret"),
    authorization?.toLowerCase().startsWith("bearer ")
      ? authorization.slice("bearer ".length)
      : null,
  ].filter(Boolean);

  return candidates.some((candidate) =>
    safeEqual(String(candidate), env.EMAIL_WEBHOOK_SECRET ?? "")
  );
}

function safeEqual(value: string, expected: string) {
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
