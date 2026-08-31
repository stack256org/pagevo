"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type RoleOption = { value: string; label: string };

// Reusable role-picker dropdown — built on the app's standard Select
// primitive (Headless UI Listbox-based: proper elevation, animation,
// positioning), used everywhere a workspace role needs to be chosen:
// workspace settings, initial onboarding, and the "new workspace" setup
// wizard.
export function RoleSelect({
  value, options, onChange, disabled = false, triggerClassName,
}: {
  value: string;
  options: readonly RoleOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
  triggerClassName?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        size="sm"
        className={triggerClassName ?? "w-26 border-base-300 bg-base-100"}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
