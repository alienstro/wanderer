"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useRef } from "react";

const CloseContext = createContext<() => void>(() => {});

/** The close function of the nearest Modal. A button inside the content calls it, so the close animation plays. */
export function useCloseModal() {
  return useContext(CloseContext);
}

/** A button that closes the nearest Modal with the close animation, such as Cancel. */
export function ModalClose({ className = "pill pill-soft", children }: { className?: string; children: ReactNode }) {
  const close = useCloseModal();
  return (
    <button type="button" className={className} onClick={close}>
      {children}
    </button>
  );
}

/** Waits for the CSS close transition of the dialog and its backdrop. With no transition, it waits for nothing. */
async function closeAnimationEnd(dialog: HTMLDialogElement) {
  const animations = dialog.getAnimations?.({ subtree: true }) ?? [];
  await Promise.allSettled(animations.map((animation) => animation.finished));
}

/**
 * A modal dialog on the native <dialog> element. The browser gives the focus trap, the Esc key, the backdrop and
 * the focus return. Each close (Esc, a click on the backdrop, `closeButton` or `useCloseModal`) plays the close
 * animation. Then `onClose` runs, and the parent removes the modal.
 *
 * `variant="sheet"` is a panel on the right side, and a bottom sheet on a phone. `className` adds to the dialog,
 * for example a different width.
 */
export function Modal({
  title,
  onClose,
  children,
  closeButton = false,
  variant = "center",
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeButton?: boolean;
  variant?: "center" | "sheet";
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // The pointer down target. A drag from the panel that ends on the backdrop does not close the modal.
  const downOnBackdrop = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const close = useCallback(() => ref.current?.close(), []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${variant === "sheet" ? "modal-sheet" : "modal-center"} ${className}`}
      // Each close fires "close" one time. The parent removes the modal after the close animation.
      onClose={(event) => {
        const dialog = event.currentTarget;
        // In StrictMode, React closes and opens the dialog again on mount. The late "close" event finds it open.
        if (dialog.open) {
          return;
        }
        void closeAnimationEnd(dialog).then(() => onCloseRef.current());
      }}
      onPointerDown={(event) => {
        downOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // The panel fills the dialog, so only a click on the ::backdrop has the dialog as its target.
        if (downOnBackdrop.current && event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div className="modal-panel panel">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="m-0 text-lg font-bold">
            {title}
          </h2>
          {closeButton && (
            <button type="button" className="pill pill-soft" onClick={close}>
              Close
            </button>
          )}
        </div>
        <CloseContext value={close}>{children}</CloseContext>
      </div>
    </dialog>
  );
}
