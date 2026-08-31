// Shared by every reaction-badge hover tooltip (page/block comments and
// database cell comments) so "who reacted" always reads the same way,
// matching Notion's "X reacted with 😀" convention — always the reactor's
// real name, even for your own reaction (no "You" substitution).

// The "who" part alone (e.g. "Khushbu Pambhar", "X and Y", "X, Y, and N
// others") — split out from the full sentence so ReactionTooltip can render
// it bold/highlighted, matching Notion's own styling, while the rest of the
// sentence stays a plain muted caption.
export function formatReactorNames(
  userIds: string[],
  nameById: Record<string, string | null | undefined>
): string {
  const names = userIds.map((id) => nameById[id] || "Former Member");

  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  if (names.length === 3) {
    return `${names[0]}, ${names[1]}, and ${names[2]}`;
  }
  return `${names[0]}, ${names[1]}, and ${names.length - 2} others`;
}

export function formatReactionTooltip(
  emoji: string,
  userIds: string[],
  nameById: Record<string, string | null | undefined>
): string {
  return `${formatReactorNames(userIds, nameById)} reacted with ${emoji}`;
}
