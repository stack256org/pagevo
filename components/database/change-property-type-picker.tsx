"use client";

import {
  Listbox,
  ListboxOption,
  ListboxOptions,
  Popover,
  PopoverPanel,
} from "@headlessui/react";
import { ArrowLeft, Check, Type as TextT } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FormulaConfigPicker } from "@/components/database/formula-config-picker";
import {
  PROPERTY_REGISTRY,
  PROPERTY_TYPE_ICON,
} from "@/components/database/property-registry";
import { RectAnchorTrigger } from "@/components/database/rect-popover-anchor";
import { RelationDatabasePicker } from "@/components/database/relation-database-picker";
import { RollupConfigPicker } from "@/components/database/rollup-config-picker";
import type { DbProperty } from "@/components/database/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

interface ChangePropertyTypePickerProps {
  onBack: () => void;
  /** The type change committed successfully. Kept separate from onClose so the parent
   *  can distinguish "dismissed" from "changed" — the Edit property panel dismisses
   *  only this picker and stays open on the new type, remounting its body (keyed on
   *  property.type) so state seeded from the old type doesn't linger. */
  onChanged: () => void;
  /** Dismiss without changing anything — clicking outside, backing out of a sub-picker. */
  onClose: () => void;
  onUpdateProperty: (patch: Record<string, unknown>) => Promise<void>;
  properties: DbProperty[];
  property: DbProperty;
  rect: DOMRect;
  workspaceId: string;
}

// Converting to one of these types makes existing stored values unreachable (relation/person need
// real references; formula/rollup/created_by are computed, never read from property_values).
// Mirrors the server's destructiveTypes in .../properties/[propId]/route.ts, checked client-side
// first so the dialog can name the property instead of reacting to a 400.
const DESTRUCTIVE_TARGET_TYPES = new Set([
  "relation",
  "person",
  "formula",
  "rollup",
  "created_by",
]);

// Same type list + sub-picker pattern as table-view.tsx's AddPropertyMenu, but PATCHes an
// existing property instead of creating one — kept separate since "change type" needs a
// destructive-confirm step creation never does.
export function ChangePropertyTypePicker({
  rect,
  property,
  properties,
  workspaceId,
  onBack,
  onClose,
  onChanged,
  onUpdateProperty,
}: ChangePropertyTypePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pickingRelation, setPickingRelation] = useState(false);
  const [pickingRollup, setPickingRollup] = useState(false);
  const [pickingFormula, setPickingFormula] = useState(false);
  const [pendingChange, setPendingChange] = useState<{
    type: string;
    config?: Record<string, unknown>;
  } | null>(null);
  const [committing, setCommitting] = useState(false);

  const types = Object.values(PROPERTY_REGISTRY);
  const menuWidth = 240;

  async function commit(
    type: string,
    config?: Record<string, unknown>,
    confirmDestructive?: boolean
  ) {
    setCommitting(true);
    try {
      await onUpdateProperty({
        type,
        config: config ?? {},
        ...(confirmDestructive ? { confirmDestructive: true } : {}),
      });
      onChanged();
    } catch {
      toast.error(
        `Couldn't change "${property.name}" to ${PROPERTY_REGISTRY[type as keyof typeof PROPERTY_REGISTRY]?.label ?? type}`
      );
    } finally {
      setCommitting(false);
    }
  }

  function pickType(type: string, config?: Record<string, unknown>) {
    if (type === property.type) {
      onClose();
      return;
    }
    if (DESTRUCTIVE_TARGET_TYPES.has(type)) {
      // Fall out of whichever sub-picker (Relation/Rollup/Formula) got us here —
      // the confirm dialog below lives outside those early-return branches, so
      // without this it would set pendingChange but never actually render.
      setPickingRelation(false);
      setPickingRollup(false);
      setPickingFormula(false);
      setPendingChange({ type, config });
      return;
    }
    commit(type, config);
  }

  if (pickingRelation) {
    return (
      <RelationDatabasePicker
        onBack={() => setPickingRelation(false)}
        onClose={onClose}
        onPick={(relatedDatabaseId, twoWay) =>
          pickType("relation", { relatedDatabaseId, twoWay })
        }
        rect={rect}
        workspaceId={workspaceId}
      />
    );
  }

  if (pickingRollup) {
    return (
      <RollupConfigPicker
        onBack={() => setPickingRollup(false)}
        onClose={onClose}
        onPick={(config) => pickType("rollup", config)}
        properties={properties}
        rect={rect}
      />
    );
  }

  if (pickingFormula) {
    return (
      <FormulaConfigPicker
        databaseId={property.databaseId}
        onBack={() => setPickingFormula(false)}
        onClose={onClose}
        onPick={(expression) => pickType("formula", { expression })}
        properties={properties}
        rect={rect}
      />
    );
  }

  return (
    <>
      <Popover>
        <RectAnchorTrigger rect={rect} />
        <PopoverPanel
          anchor={{ to: "bottom end", gap: 4 }}
          className="z-500 overflow-hidden rounded-md border border-base-300 bg-base-200"
          data-edit-property-exempt
          ref={ref}
          static
          style={{ width: menuWidth }}
        >
          {/* Header matches the sibling step-pickers (rollup/formula) exactly —
              same padding, same icon button, same title weight — so stepping
              between them doesn't shift the chrome around. */}
          <div className="flex items-center gap-1.5 border-b border-base-300 px-2.5 py-2">
            <button
              aria-label="Back"
              className="flex size-5 shrink-0 items-center justify-center rounded-xs text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={onBack}
              type="button"
            >
              <ArrowLeft size={13} />
            </button>
            <p className="text-xs font-semibold text-base-content/80">
              Change type
            </p>
          </div>
          <Listbox
            disabled={committing}
            onChange={(type: string) => {
              if (type === "relation") {
                setPickingRelation(true);
              } else if (type === "rollup") {
                setPickingRollup(true);
              } else if (type === "formula") {
                setPickingFormula(true);
              } else {
                pickType(type);
              }
            }}
            value={property.type}
          >
            <ListboxOptions className="max-h-60 overflow-y-auto p-1.5" static>
              {types.map((def) => {
                const Icon =
                  PROPERTY_TYPE_ICON[
                    def.type as keyof typeof PROPERTY_TYPE_ICON
                  ] ?? TextT;
                return (
                  <ListboxOption
                    className={({ focus, disabled }) =>
                      cn(
                        "flex w-full cursor-default items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-base-content",
                        focus && "bg-base-200",
                        disabled && "opacity-50"
                      )
                    }
                    key={def.type}
                    value={def.type}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-xs bg-base-200/50 text-base-content/70">
                      <Icon size={12} />
                    </span>
                    <span className="flex-1 text-left">{def.label}</span>
                    {def.type === property.type && (
                      <Check className="shrink-0 text-primary" size={13} />
                    )}
                  </ListboxOption>
                );
              })}
            </ListboxOptions>
          </Listbox>
        </PopoverPanel>
      </Popover>

      <ConfirmDialog
        className="z-600"
        confirmLabel="Change type"
        confirmLoadingLabel="Changing…"
        description={`"${property.name}" currently has stored values that this type can't reuse — they'll be permanently cleared. This can't be undone.`}
        loading={committing}
        onConfirm={() => {
          if (pendingChange) {
            commit(pendingChange.type, pendingChange.config, true);
          }
        }}
        onOpenChange={(o) => {
          if (!o) {
            setPendingChange(null);
          }
        }}
        open={!!pendingChange}
        overlayClassName="z-600"
        title={`Change type to ${pendingChange ? PROPERTY_REGISTRY[pendingChange.type as keyof typeof PROPERTY_REGISTRY]?.label : ""}?`}
      />
    </>
  );
}
