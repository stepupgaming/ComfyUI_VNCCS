"use client";

import { cn } from "@workspace/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export type AssetState = "installed" | "progress" | "missing";

export function assetState(status: string | undefined): AssetState {
  if (status === "installed") {
    return "installed";
  }
  return status === "queued" || status === "downloading"
    ? "progress"
    : "missing";
}

/** The bordered card behind model, LoRA and SeedVR choices. */
export function AssetCardFrame({
  children,
  clickable = false,
  selected = false,
  state,
}: {
  children: ReactNode;
  clickable?: boolean;
  selected?: boolean;
  state: AssetState;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-2.5 transition-colors",
        selected && "border-primary bg-primary/5",
        state !== "installed" && "border-dashed",
        clickable && "hover:border-primary/60"
      )}
    >
      {children}
    </div>
  );
}

/**
 * The card's name row. As a picker head it toggles the list (`open`);
 * otherwise it selects the asset.
 */
export function AssetCardHead({
  children,
  disabled,
  head = false,
  name,
  onSelect,
  open = false,
  selected = false,
  state,
}: {
  /** Status badge, switch or other trailing controls. */
  children?: ReactNode;
  disabled: boolean;
  head?: boolean;
  name: string;
  onSelect?: () => void;
  open?: boolean;
  selected?: boolean;
  state: AssetState;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        aria-expanded={head ? open : undefined}
        aria-pressed={head ? undefined : selected}
        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
        disabled={disabled}
        onClick={onSelect}
        type="button"
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-2 shrink-0 rounded-full",
            state === "installed" && "bg-emerald-500",
            state === "progress" && "bg-amber-500",
            state === "missing" && "bg-muted-foreground/40"
          )}
        />
        <span className="truncate font-medium text-sm" title={name}>
          {name}
        </span>
        {head ? (
          <ChevronDown
            className={cn(
              "ml-auto size-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
          />
        ) : null}
      </button>
      {children}
    </div>
  );
}

export function AssetDescription({ text }: { text?: string }) {
  return text ? (
    <p className="line-clamp-2 text-muted-foreground text-xs">{text}</p>
  ) : null;
}
