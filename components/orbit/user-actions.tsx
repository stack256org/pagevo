"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import {
  setUserRoleAction,
  toggleUserBanAction,
} from "@/app/actions/orbit-users";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ADMIN_ROLE, USER_ROLE } from "@/config/platform";

export function UserRoleForm({
  role,
  userId,
}: {
  role: string | null;
  userId: string;
}) {
  const nextRole = role === ADMIN_ROLE ? USER_ROLE : ADMIN_ROLE;

  return (
    <form action={setUserRoleAction}>
      <input name="userId" type="hidden" value={userId} />
      <input name="role" type="hidden" value={nextRole} />
      <Button size="sm" type="submit" variant="secondary">
        Make {nextRole}
      </Button>
    </form>
  );
}

export function UserBanForm({
  banned,
  userId,
}: {
  banned: boolean;
  userId: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("userId", userId);
      formData.set("banned", String(!banned));
      await toggleUserBanAction(formData);
    });
  }

  return (
    <>
      <Button
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
        size="sm"
        type="button"
        variant={banned ? "secondary" : "destructive"}
      >
        {pending && <Loader2 className="animate-spin" size={13} />}
        {pending
          ? banned
            ? "Unbanning…"
            : "Banning…"
          : banned
            ? "Unban"
            : "Ban"}
      </Button>

      <ConfirmDialog
        confirmLabel={banned ? "Unban" : "Ban"}
        confirmLoadingLabel={banned ? "Unbanning…" : "Banning…"}
        description={
          banned
            ? "This user will regain the ability to sign in."
            : "This immediately revokes all active sessions and blocks the user from signing in."
        }
        loading={pending}
        onConfirm={handleConfirm}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title={banned ? "Unban this user?" : "Ban this user?"}
      />
    </>
  );
}
