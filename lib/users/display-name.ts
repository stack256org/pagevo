// Falls back to the email's local part rather than null, so "never set a name" stays visually distinct
// from "no longer a member" (which renders differently) wherever display names are shown.
export function resolveDisplayName(
  name: string | null | undefined,
  email: string | null | undefined
): string | null {
  return name || (email ? email.split("@")[0] : null);
}
