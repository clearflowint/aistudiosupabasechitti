// SKELETON: Shared modal primitive. Feature modules supply their own form and actions.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

// Shared lock supports one modal replacing another without briefly unlocking the page.
let activeModalLocks = 0;
let pendingUnlockFrame: number | null = null;
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
  const panelRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const focusScrollFrameRef = useRef<number | null>(null);
  onCloseRef.current = onClose;

  // Keep mobile dialogs inside the currently visible viewport as browser
  // chrome and the on-screen keyboard change its dimensions.
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    const overlay = panel?.parentElement;
    if (!panel || !overlay) return;

    const updateViewport = () => {
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      overlay.style.height = height + "px";
      overlay.style.top = top + "px";
      panel.style.maxHeight = Math.max(180, height - 16) + "px";
    };

    const viewport = window.visualViewport;
    updateViewport();
    window.addEventListener("resize", updateViewport);
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      overlay.style.height = "";
      overlay.style.top = "";
      panel.style.maxHeight = "";
    };
  }, [isOpen, size]);

  useEffect(() => {
    if (!isOpen) return;
    const content = contentRef.current;
    if (!content) return;

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !content.contains(target)) return;
      if (focusScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(focusScrollFrameRef.current);
      }
      focusScrollFrameRef.current = window.requestAnimationFrame(() => {
        focusScrollFrameRef.current = null;
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !content.contains(active)) return;
        const panel = panelRef.current;
        if (!panel) return;
        const activeRect = active.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        const margin = 20;
        if (activeRect.bottom > panelRect.bottom - margin) {
          content.scrollBy({ top: activeRect.bottom - panelRect.bottom + margin, behavior: "auto" });
        } else if (activeRect.top < panelRect.top + margin) {
          content.scrollBy({ top: activeRect.top - panelRect.top - margin, behavior: "auto" });
        }
      });
    };

    content.addEventListener("focusin", handleFocusIn);
    return () => {
      content.removeEventListener("focusin", handleFocusIn);
      if (focusScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(focusScrollFrameRef.current);
        focusScrollFrameRef.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    // A result modal can replace a form modal during the same update. Defer the
    // final unlock until the next frame so the replacement modal can retain the
    // original page offset rather than recapturing a temporary scroll position.
    if (pendingUnlockFrame !== null) {
      window.cancelAnimationFrame(pendingUnlockFrame);
      pendingUnlockFrame = null;
    }

    const body = document.body;
    if (activeModalLocks === 0 && originalBodyStyles === null) {
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
      // merely set to overflow:hidden. Fix the body at its current offset.
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
        pendingUnlockFrame = window.requestAnimationFrame(() => {
          pendingUnlockFrame = null;
          // A replacement modal may have mounted before this frame.
          if (activeModalLocks !== 0 || !originalBodyStyles) return;

          body.style.overflow = originalBodyStyles.overflow;
          body.style.overscrollBehavior = originalBodyStyles.overscrollBehavior;
          body.style.position = originalBodyStyles.position;
          body.style.top = originalBodyStyles.top;
          body.style.left = originalBodyStyles.left;
          body.style.right = originalBodyStyles.right;
          body.style.width = originalBodyStyles.width;
          originalBodyStyles = null;

          // Restore the saved document position after the browser applies the
          // body's original positioning, then verify it on the following frame.
          window.requestAnimationFrame(() => {
            window.scrollTo(0, lockedScrollY);
            window.requestAnimationFrame(() => window.scrollTo(0, lockedScrollY));
          });
        });
      }
    };
  }, [isOpen, closeOnEscape]);

  if (!isOpen) return null;

  const panelWidth = size === "full" ? "max-w-none" : size === "large" ? "max-w-2xl" : "max-w-lg";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-hidden overscroll-none px-3 py-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        onClick={onClose}
        disabled={!closeOnOverlayClick}
        className="fixed inset-0 cursor-default bg-slate-950/60 backdrop-blur-sm"
      />
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={"relative z-10 my-auto flex w-full min-w-0 flex-col overflow-hidden border-2 border-[#CBD5E1] ring-1 ring-[#94A3B8]/50 " + panelWidth + (size === "full" ? " rounded-xl" : " rounded-2xl shadow-2xl shadow-slate-950/25") + " bg-white"}
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
            className="rounded-lg p-2 text-red-600 transition hover:bg-red-50 hover:text-red-700"
          >
            <X size={18} />
          </button>
        </header>
        <div ref={contentRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:px-6">{footer}</footer>}
      </section>
    </div>
  );
}
