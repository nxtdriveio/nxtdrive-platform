"use client";

import dynamic from "next/dynamic";
import type { TemplateEditorClientProps } from "./editor-client";

const LazyTemplateEditorClient = dynamic(
  () => import("./editor-client").then((mod) => mod.TemplateEditorClient),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-4 py-10 text-center text-sm text-muted-foreground">
        Editor wordt geladen...
      </div>
    ),
  },
);

export function TemplateEditorShell(props: TemplateEditorClientProps) {
  return <LazyTemplateEditorClient {...props} />;
}
