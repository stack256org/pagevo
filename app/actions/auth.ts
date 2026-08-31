"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function logoutAction() {
  const requestHeaders = await headers();
  await auth.api.signOut({ headers: requestHeaders });
  redirect("/auth/login");
}
