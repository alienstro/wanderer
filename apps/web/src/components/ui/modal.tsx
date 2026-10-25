"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";

/**
 * A modal dialog on the native <dialog> element. The browser gives the focus trap, the Esc key and the
 * backdrop. The parent shows the modal while it is open and removes it on `onClose`.
 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="m-auto w-[min(480px,calc(100vw-32px))] panel p-5 text-[inherit] backdrop:bg-black/60"
      // The Esc key fires "cancel". The parent closes the modal, so React keeps the open state.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className="m-0 mb-3 text-lg font-bold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
