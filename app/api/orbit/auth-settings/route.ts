import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AuthSettingsError,
  getAuthSettings,
  isGoogleConfigured,
  updateAuthSettings,
} from "@/lib/auth/settings";
import { requireAdmin } from "@/lib/authz";
import { writeAuditLog } from "@/lib/orbit/audit";
import { apiError } from "@/lib/workspaces/auth";

export async function GET() {
  await requireAdmin();
  const settings = await getAuthSettings();

  return NextResponse.json({
    emailPasswordEnabled: settings.emailPasswordEnabled,
    magicLinkEnabled: settings.magicLinkEnabled,
    googleEnabled: settings.googleEnabled,
    googleConfigured: await isGoogleConfigured(),
    updatedAt: settings.updatedAt,
  });
}

const patchSchema = z.object({
  emailPasswordEnabled: z.boolean().optional(),
  magicLinkEnabled: z.boolean().optional(),
  googleEnabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiError(400, "Invalid request body");
  }

  try {
    const updated = await updateAuthSettings({
      ...parsed.data,
      updatedBy: admin.user.id,
    });

    await writeAuditLog({
      actorId: admin.user.id,
      action: "auth_settings.updated",
      targetType: "settings",
      metadata: {
        emailPasswordEnabled: updated.emailPasswordEnabled,
        magicLinkEnabled: updated.magicLinkEnabled,
        googleEnabled: updated.googleEnabled,
      },
    });

    return NextResponse.json({
      emailPasswordEnabled: updated.emailPasswordEnabled,
      magicLinkEnabled: updated.magicLinkEnabled,
      googleEnabled: updated.googleEnabled,
      googleConfigured: await isGoogleConfigured(),
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    if (error instanceof AuthSettingsError) {
      return apiError(400, error.message);
    }
    throw error;
  }
}
