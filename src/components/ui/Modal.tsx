// SKELETON: Shared modal primitive. Feature modules supply their own form and actions.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// Shared lock avoids stale scroll styles when one modal replaces another in the same render.
let activeModalLocks = 0;
let originalBodyStyles: {
  overflow: string;
  overscrollBehavior: string;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
} | null = null;
let lockedScrollY = 0;

interface ModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "medium" | "large" | "full";
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
}

export function Modal({
  isOpen,
  title,
  description,
  onClose,
  children,
  footer,
  size = "medium",
  closeOnOverlayClick = false,
  closeOnEscape = true,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    // Lock body scrolling while any modal is open. A shared counter is important
    // when a result modal replaces a form modal in one React render.
    const body = document.body;
    if (activeModalLocks === 0) {
      lockedScrollY = window.scrollY;
      originalBodyStyles = {
        overflow: body.style.overflow,
        overscrollBehavior: body.style.overscrollBehavior,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
      };
      // iOS Safari can reset the document to the top when body scrolling is
      // merely set to overflow:hidden. Fix the body in place at the current
      // offset, then restore the exact offset when the final modal closes.
      body.style.position = "fixed";
      body.style.top = `-${lockedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
    }
    activeModalLocks += 1;

    function handleKeyDown(event: KeyboardEvent) {
      if (closeOnEscape && event.key === "Escape") onCloseRef.current();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      activeModalLocks = Math.max(0, activeModalLocks - 1);
      if (activeModalLocks === 0 && originalBodyStyles) {
        body.style.overflow = originalBodyStyles.overflow;
        body.style.overscrollBehavior = originalBodyStyles.overscrollBehavior;
        body.style.position = originalBodyStyles.position;
        body.style.top = originalBodyStyles.top;
        body.style.left = originalBodyStyles.left;
        body.style.right = originalBodyStyles.right;
        body.style.width = originalBodyStyles.width;
        originalBodyStyles = null;
        // Restore after layout has applied the body's original positioning.
        window.requestAnimationFrame(() => window.scrollTo(0, lockedScrollY));
      }
    };
  }, [isOpen, closeOnEscape]);

  if (!isOpen) return null;

  const panelWidth = size === "full" ? "max-w-none" : size === "large" ? "max-w-2xl" : "max-w-lg";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto overscroll-contain px-3 py-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        disabled={!closeOnOverlayClick}
        className="fixed inset-0 cursor-default bg-slate-950/60 backdrop-blur-sm"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={"relative z-10 my-auto max-h-[calc(100dvh-1rem)] w-full overflow-y-auto overscroll-contain " + panelWidth + (size === "full" ? " min-h-[calc(100dvh-1rem)] rounded-xl" : " rounded-2xl border border-slate-200 shadow-2xl shadow-slate-950/25 sm:max-h-[calc(100dvh-3rem)]") + " bg-white"}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 id={titleId} className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={18} />
          </button>
        </header>
        <div className="px-5 py-5 sm:px-6">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">{footer}</footer>}
      </section>
    </div>
  );
}
