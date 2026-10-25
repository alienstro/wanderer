import "@testing-library/jest-dom/vitest";

// jsdom has no pointer capture. Sonner calls it when a test clicks a button in a toast.
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
  HTMLElement.prototype.hasPointerCapture = () => false;
}

// jsdom has no modal dialog. The stubs do what a browser does: showModal() moves the focus to the first control,
// Escape fires "cancel" and then closes, and close() gives the focus back to the opener and then fires "close".
if (!HTMLDialogElement.prototype.showModal) {
  const opened = new WeakMap<HTMLDialogElement, { opener: Element | null; onKey: (event: KeyboardEvent) => void }>();

  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && this.dispatchEvent(new Event("cancel", { cancelable: true }))) {
        this.close();
      }
    };
    opened.set(this, { opener: document.activeElement, onKey });
    document.addEventListener("keydown", onKey);
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>("button, input, textarea, select, a[href]")?.focus();
  };

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    const state = opened.get(this);
    if (!this.hasAttribute("open")) {
      return;
    }
    this.removeAttribute("open");
    if (state) {
      opened.delete(this);
      document.removeEventListener("keydown", state.onKey);
      (state.opener as HTMLElement | null)?.focus?.();
    }
    // A browser fires "close" in a later task, not during close().
    queueMicrotask(() => this.dispatchEvent(new Event("close")));
  };
}
