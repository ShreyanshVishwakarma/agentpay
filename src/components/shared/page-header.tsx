import { cn } from "@/lib/utils";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: {
  kicker?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
        className,
      )}
    >
      <div className="fade-up max-w-2xl">
        {kicker && (
          <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span aria-hidden className="size-1 rounded-full bg-primary" />
            {kicker}
          </p>
        )}
        <h1 className="font-display text-3xl font-bold tracking-tighter text-foreground sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="fade-up flex flex-wrap items-center gap-2 [animation-delay:120ms]">
          {actions}
        </div>
      )}
    </div>
  );
}
