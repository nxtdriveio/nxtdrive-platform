import { cn } from "@/lib/utils";

/** Loading placeholder (Task #177). Used in splash/Suspense fallbacks. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
