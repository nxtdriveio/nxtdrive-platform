"use client";

import { removeMember } from "./actions";

export function RemoveMemberButton({
  membershipId,
  userId,
  displayName,
}: {
  membershipId: string;
  userId: string;
  displayName: string;
}) {
  return (
    <form
      action={removeMember}
      onSubmit={(e) => {
        if (!confirm(`Weet je zeker dat je ${displayName} wilt verwijderen?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="membership_id" value={membershipId} />
      <input type="hidden" name="user_id" value={userId} />
      <button
        type="submit"
        className="text-xs text-destructive hover:underline"
      >
        Verwijderen
      </button>
    </form>
  );
}
