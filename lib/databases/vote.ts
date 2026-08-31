// A "vote" is just the acting user's own id present in a Person value's userIds.
// UI-side toggle only — the server independently re-enforces that a non-admin
// write may only add/remove the requester's own id.

export interface VoteUser {
  email?: string | null;
  id: string;
  name?: string | null;
}

export type VoteValue = {
  userIds: string[];
  _members: { id: string; name: string; email: string }[];
};

export function toggleSelfVote(
  current:
    | {
        userIds?: string[];
        _members?: { id: string; name?: string; email?: string }[];
      }
    | null
    | undefined,
  user: VoteUser
): VoteValue {
  const userIds = current?.userIds ?? [];
  const members = (current?._members ?? []).map((m) => ({
    id: m.id,
    name: m.name ?? "",
    email: m.email ?? "",
  }));
  const hasVoted = userIds.includes(user.id);
  return {
    userIds: hasVoted
      ? userIds.filter((id) => id !== user.id)
      : [...userIds, user.id],
    _members: hasVoted
      ? members.filter((m) => m.id !== user.id)
      : [
          ...members,
          { id: user.id, name: user.name ?? "", email: user.email ?? "" },
        ],
  };
}
