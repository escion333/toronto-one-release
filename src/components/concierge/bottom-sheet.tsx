"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** App-specific shadcn sheet. Only the handle captures a dismiss gesture. */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  returnFocusRef,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const start = useRef<number | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const distance = useRef(0);
  const wasDragged = useRef(false);
  const priorFocus = useRef<HTMLElement | null>(null);
  function finish() {
    const dismiss = distance.current > 76;
    start.current = null;
    distance.current = 0;
    sheet.current?.style.removeProperty("--sheet-drag");
    sheet.current?.removeAttribute("data-dragging");
    if (dismiss) onOpenChange(false);
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={sheet}
        side="bottom"
        className={cn("native-sheet", className)}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          priorFocus.current =
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body
              ? document.activeElement
              : null;
          sheet.current
            ?.querySelector<HTMLElement>('[data-slot="sheet-title"]')
            ?.focus();
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current ?? priorFocus.current;
          if (target?.isConnected) {
            event.preventDefault();
            target.focus({ preventScroll: true });
          }
        }}
      >
        <button
          type="button"
          className="sheet-handle"
          aria-label="Dismiss sheet"
          onClick={(event) => {
            if (event.detail === 0 || !wasDragged.current) onOpenChange(false);
          }}
          onPointerDown={(event) => {
            start.current = event.clientY;
            wasDragged.current = false;
            sheet.current?.setAttribute("data-dragging", "true");
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (start.current === null) return;
            const movement = event.clientY - start.current;
            // A drag in either direction must not become the button's click.
            // Keep this latched even when the pointer returns to its origin.
            wasDragged.current = wasDragged.current || Math.abs(movement) > 5;
            distance.current = Math.max(0, movement);
            sheet.current?.style.setProperty("--sheet-drag", `${distance.current}px`);
          }}
          onPointerUp={finish}
          onPointerCancel={() => {
            start.current = null;
            distance.current = 0;
            sheet.current?.style.removeProperty("--sheet-drag");
            sheet.current?.removeAttribute("data-dragging");
          }}
        >
          <span />
        </button>
        <SheetHeader>
          <SheetTitle tabIndex={-1}>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-actions">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
