import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { passwordSchema } from "@/lib/auth/password";
import { isAuthMethodEnabled } from "@/lib/auth/settings";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

const setPasswordSchema = z.object({
  newPassword: passwordSchema,
});

// POST /api/user/set-password — lets Google-only users add a password.
// better-auth's setPassword is server-only, so this route wraps it for the profile page.
export async function POST(req: Request) {
  try {
    await getSession();

    if (!(await isAuthMethodEnabled("emailPassword"))) {
      return apiError(
        403,
        "Email and password sign-in is turned off on this instance."
      );
    }

    const body = await req.json();
    const parsed = setPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(
        400,
        parsed.error.issues[0]?.message ?? "Invalid password"
      );
    }

    await auth.api.setPassword({
      headers: await headers(),
      body: { newPassword: parsed.data.newPassword },
    });

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    // better-auth throws its own APIError for domain errors, e.g.
    // PASSWORD_ALREADY_SET if a credential account was created elsewhere
    // (another tab, the reset-password flow) between page load and submit.
    if (err instanceof APIError) {
      return apiError(err.statusCode, err.message);
    }
    console.error("[set-password]", err);
    return apiError(500, "Internal server error");
  }
}
