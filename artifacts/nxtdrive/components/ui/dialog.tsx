"use client";

import * as React from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  titleId: string;
  descriptionId: string;
};

const DialogContext = React.createContext<DialogContextValue>({
  open: false,
  setOpen: () => {},
  titleId: "",
  descriptionId: "",
});

export function Dialog({
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const open = controlledOpen ?? internalOpen;
  const setOpen = (val: boolean) => {
    setInternalOpen(val);
    onOpenChange?.(val);
  };
  return (
    <DialogContext.Provider value={{ open, setOpen, titleId, descriptionId }}>
      {children}
    </DialogContext.Provider>
  );
}

export function DialogTrigger({
  asChild,
  children,
  ...props
}: {
  asChild?: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const { open, setOpen } = React.useContext(DialogContext);
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
      {
        ...props,
        "aria-expanded": open,
        "aria-haspopup": "dialog",
        onClick: (e: React.MouseEvent<HTMLElement>) => {
          (children.props as React.HTMLAttributes<HTMLElement>).onClick?.(e);
          setOpen(true);
        },
      },
    );
  }
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-haspopup="dialog"
      {...props}
      onClick={() => setOpen(true)}
    >
      {children}
    </button>
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const { open, setOpen, titleId, descriptionId } =
    React.useContext(DialogContext);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const [portalContainer, setPortalContainer] =
    React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const content = contentRef.current;
      if (!content) return;
      const preferred = content.querySelector<HTMLElement>("[autofocus]");
      const first = content.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (preferred ?? first ?? content).focus();
    });
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const content = contentRef.current;
      if (!content) return;
      const focusable = Array.from(
        content.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          element.getClientRects().length > 0,
      );
      if (focusable.length === 0) {
        e.preventDefault();
        content.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previousOverflow;
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus();
    };
  }, [open, portalContainer, setOpen]);

  if (!open || !portalContainer) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        ref={contentRef}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-lg rounded-xl bg-card border border-border shadow-xl p-6 mx-4 max-h-[90vh] overflow-y-auto",
          className,
        )}
        {...props}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Sluiten"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>,
    portalContainer,
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4", className)} {...props} />;
}

export function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = React.useContext(DialogContext);
  return (
    <h2
      id={titleId}
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const { descriptionId } = React.useContext(DialogContext);
  return (
    <p
      id={descriptionId}
      className={cn("text-sm text-muted-foreground mt-1", className)}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex justify-end gap-2 mt-6", className)} {...props} />
  );
}

export function useDialog() {
  return React.useContext(DialogContext);
}
