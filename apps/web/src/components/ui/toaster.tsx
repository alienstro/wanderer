"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

// Sonner reads these variables, so the toasts use the theme tokens. The inline style wins over the Sonner font.
const look = {
  "--normal-bg": "var(--color-surface-2)",
  "--normal-border": "var(--color-field-line)",
  "--normal-text": "var(--color-text)",
  "--border-radius": "14px",
  fontFamily: "var(--font-sans)",
} as CSSProperties;

/** The toasts of the app. They show at the top, so they do not cover the text box of a chat. */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      closeButton
      style={look}
      toastOptions={{ classNames: { description: "toast-description", actionButton: "toast-action" } }}
    />
  );
}
