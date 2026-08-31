"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RoleSelect } from "@/components/ui/role-select";

type Role = "admin" | "editor" | "viewer";

const BASE_ROLE_OPTIONS = [
  { value: "editor", label: "Member" },
  { value: "viewer", label: "Viewer" },
] as const;
const ADMIN_ROLE_OPTION = { value: "admin", label: "Admin" } as const;

const ROLE_CAPTIONS: Record<Role, string> = {
  admin: "Full access, including workspace settings and inviting others.",
  editor: "Can create, edit, and comment on pages.",
  viewer: "Can view and comment, but not edit.",
};

interface Props {
  isOwner?: boolean;
  onClose: () => void;
  workspaceId: string;
}

// Quick "invite by email" popup from the workspace switcher; full member management lives in
// components/settings/workspace-members-section.tsx. Admin option is owner-only since the server rejects it otherwise.
export function InviteMembersModal({
  workspaceId,
  isOwner = false,
  onClose,
}: Props) {
  const roleOptions = isOwner
    ? [ADMIN_ROLE_OPTION, ...BASE_ROLE_OPTIONS]
    : BASE_ROLE_OPTIONS;
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function handleSendInvite() {
    const list = Array.from(
      new Set(
        emails
          .split(",")
          .map((e) => e.trim())
          .filter(Boolean)
      )
    );
    if (list.length === 0) {
      setError("Add at least one email address.");
      return;
    }

    setSending(true);
    setError("");
    const failed: string[] = [];
    let lastReason = "";

    for (const email of list) {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role }),
        });
        if (!res.ok) {
          failed.push(email);
          const body = await res.json().catch(() => null);
          lastReason = body?.error || `HTTP ${res.status}`;
        }
      } catch {
        failed.push(email);
        lastReason = "Network error";
      }
    }

    setSending(false);

    const sent = list.length - failed.length;
    if (sent > 0) {
      toast.success(
        sent === 1 ? "Invitation sent" : `${sent} invitations sent`,
        {
          description:
            sent === 1
              ? `${list.find((e) => !failed.includes(e))} will get an email to join.`
              : "They'll each get an email to join.",
        }
      );
    }

    if (failed.length > 0) {
      setError(`Couldn't invite ${failed.join(", ")}: ${lastReason}`);
      if (sent === 0) {
        return;
      }
    }

    onClose();
  }

  return (
    <Dialog
      onOpenChange={(o) => {
        if (!o) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="max-w-105">
        <DialogHeader>
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10">
              <UserPlus className="text-primary" size={18} />
            </div>
            <DialogTitle>Add members</DialogTitle>
            <DialogDescription>
              Type or paste in emails below, separated by commas
            </DialogDescription>
          </div>
        </DialogHeader>

        <Input
          autoFocus
          onChange={(e) => {
            setEmails(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSendInvite();
            }
          }}
          placeholder="Search names or emails"
          value={emails}
        />

        <div>
          <p className="mb-1.5 text-xs font-medium text-base-content/70">
            Select role
          </p>
          <RoleSelect
            onChange={(v) => setRole(v as Role)}
            options={roleOptions}
            triggerClassName="w-full border-base-300 bg-base-200"
            value={role}
          />
          <p className="mt-1.5 text-xs text-base-content/70">
            {ROLE_CAPTIONS[role]}
          </p>
        </div>

        {error && <p className="text-xs text-error">{error}</p>}

        <div>
          <Button
            className="w-full"
            disabled={sending || !emails.trim()}
            onClick={handleSendInvite}
          >
            {sending ? "Sending…" : "Send invite"}
          </Button>
          <Button
            className="mt-2 w-full text-base-content/70"
            disabled={sending}
            onClick={onClose}
            variant="ghost"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
