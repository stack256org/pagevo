import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  jobTitle: z.string().max(80).nullable().optional(),
  timezone: z.string().max(64).nullable().optional(),
  image: z.string().url().max(512).nullable().optional(),
});

// PATCH /api/user/profile
export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { name, jobTitle, timezone, image } = parsed.data;
    const updateSet: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) {
      updateSet.name = name;
    }
    if (jobTitle !== undefined) {
      updateSet.jobTitle = jobTitle;
    }
    if (timezone !== undefined) {
      updateSet.timezone = timezone;
    }
    if (image !== undefined) {
      updateSet.image = image;
    }

    const [updated] = await db
      .update(users)
      .set(updateSet)
      .where(eq(users.id, session.user.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        jobTitle: users.jobTitle,
        timezone: users.timezone,
        image: users.image,
      });

    return Response.json(updated);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
