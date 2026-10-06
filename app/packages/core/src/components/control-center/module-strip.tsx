"use client";

import { useModuleStatus } from "@workspace/core/hooks/use-control-center";
import { Badge } from "@workspace/ui/components/badge";
import {
  describeModules,
  type PillState,
} from "@workspace/vnccs/control-center";
import { TriangleAlert } from "lucide-react";
import { useMemo } from "react";

const PILL_VARIANTS: Record<PillState, "success" | "warning" | "destructive"> =
  {
    ok: "success",
    warning: "warning",
    partial: "warning",
    dup: "warning",
    error: "destructive",
  };

/** Installed VNCCS modules and the custom nodes they depend on. */
export function ModuleStrip() {
  const { error, status } = useModuleStatus();
  const { notices, pills } = useMemo(
    () => (status ? describeModules(status) : { notices: [], pills: [] }),
    [status]
  );
  const missing = pills.filter((pill) => pill.missing);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Modules</span>
        {error ? (
          <Badge variant="destructive">Status unavailable: {error}</Badge>
        ) : null}
        {status === null && !error ? (
          <Badge variant="outline">Checking…</Badge>
        ) : null}
        {pills.map((pill) => (
          <Badge
            key={pill.key}
            title={pill.detail || undefined}
            variant={PILL_VARIANTS[pill.state]}
          >
            {pill.version ? `${pill.label} v${pill.version}` : pill.label}
          </Badge>
        ))}
      </div>
      {notices.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <ul className="flex flex-col gap-1">
            {notices.map((notice) => (
              <li key={notice}>{notice}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {missing.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <span className="font-medium">Missing custom nodes</span>
          <p className="text-muted-foreground">
            VNCCS uses these custom nodes internally. Install them into the
            runtime&apos;s custom_nodes folder, then restart ComfyUI.
          </p>
          <ul className="flex flex-col gap-1">
            {missing.map((pill) => (
              <li className="flex flex-wrap items-center gap-2" key={pill.key}>
                <span className="font-medium">{pill.label}</span>
                <span className="text-muted-foreground">{pill.detail}</span>
                {pill.githubUrl ? (
                  <a
                    className="select-all break-all font-mono text-primary text-xs underline-offset-4 hover:underline"
                    href={pill.githubUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {pill.githubUrl}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
