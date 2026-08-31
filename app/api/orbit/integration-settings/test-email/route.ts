import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { sendEmailViaSmtp } from "@/lib/smtp/client";

// POST — admin only. Sends a real test email to the requesting admin's own
// account address, using the currently *saved* settings (not whatever the
// form has typed but not submitted yet).
export async function POST() {
  const admin = await requireAdmin();

  try {
    const result = await sendEmailViaSmtp({
      to: admin.user.email,
      subject: "Test email from your instance",
      html: "<p>This is a test email — SMTP is configured correctly.</p>",
      text: "This is a test email — SMTP is configured correctly.",
    });

    if (result.status === "logged") {
      return NextResponse.json({
        ok: false,
        error:
          "SMTP isn't fully configured yet — save host, port, username, password, and from address first.",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to send.",
    });
  }
}
