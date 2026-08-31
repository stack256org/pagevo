"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface Props {
  disabled?: boolean;
  hasSavedValue: boolean;
  id: string;
  onChange: (value: string) => void;
  value: string;
}

/** Masked secret field. Never shows the saved value — only whether one
 * exists. Typing replaces it on save; leaving it blank keeps the saved value
 * untouched. */
export function SecretInput({
  id,
  value,
  onChange,
  hasSavedValue,
  disabled,
}: Props) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="relative">
      <Input
        autoComplete="new-password"
        disabled={disabled}
        id={id}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hasSavedValue ? "Saved — leave blank to keep" : ""}
        type={revealed ? "text" : "password"}
        value={value}
      />
      <button
        aria-label={revealed ? "Hide" : "Show"}
        className="absolute inset-y-0 right-2 flex items-center text-base-content/50 hover:text-base-content"
        onClick={() => setRevealed((r) => !r)}
        tabIndex={-1}
        type="button"
      >
        {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}
