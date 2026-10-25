"use client";

import { type MouseEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { saveSidebarRail } from "@/lib/sidebar-rail";
import { Logo } from "./logo";

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  "aria-hidden": true,
} as const;

/**
 * The sidebar of the app. On a computer it is a floating column on the left.
 * The toggle button changes it to a rail of icons (64 px) and back. `defaultRail` is the saved choice from the cookie.
 * z-10 puts the account menu and the rail tooltips above the page, and keeps them below the dialogs of the page (z-30).
 * On a phone (760 px or less) a thin top bar with a menu button opens it as a drawer from the left.
 * The top bar is 56 px high (h-14). The chat page uses this height for its own height.
 */
export function SidebarDrawer({ children, defaultRail = false }: { children: ReactNode; defaultRail?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [rail, setRail] = useState(defaultRail);
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  /** Closes the drawer. The focus goes back to the menu button, so a keyboard user does not lose the place. */
  function close() {
    setOpen(false);
    menuRef.current?.focus();
  }

  // The drawer is invisible until it opens, so the focus can move into it only after the render.
  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open]);

  /** The button stays in the DOM in both states, so the focus stays on it after the click. */
  function toggleRail() {
    saveSidebarRail(!rail);
    setRail(!rail);
  }

  /** A link in the drawer goes to a page, so the drawer closes. */
  function closeOnLink(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("a")) {
      setOpen(false);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-20 hidden h-14 flex-none items-center gap-1 border-b border-line bg-sidebar px-2 max-[760px]:flex">
        <button
          ref={menuRef}
          type="button"
          className="icon-btn tap-target"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(true)}
        >
          <svg {...iconProps}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Logo />
      </header>
      {open && <div className="fixed inset-0 z-30 bg-black/60 min-[761px]:hidden" aria-hidden="true" onClick={close} />}
      <aside
        id={id}
        data-open={open}
        data-rail={rail}
        onClick={closeOnLink}
        onKeyDown={(event) => open && event.key === "Escape" && close()}
        className="sticky top-2 z-10 m-2 mr-0 flex h-[calc(100vh-16px)] flex-[0_0_256px] flex-col gap-[18px] self-start overflow-y-auto rounded-[20px] border border-line bg-sidebar px-3 pt-[18px] pb-3.5 max-[760px]:fixed max-[760px]:inset-y-0 max-[760px]:left-0 max-[760px]:z-40 max-[760px]:m-0 max-[760px]:h-dvh max-[760px]:w-[min(300px,85vw)] max-[760px]:overscroll-contain max-[760px]:rounded-l-none max-[760px]:border-l-0 max-[760px]:transition-[translate,visibility] max-[760px]:data-[open=false]:invisible max-[760px]:data-[open=false]:-translate-x-full min-[761px]:motion-safe:transition-[flex-basis] rail:flex-[0_0_64px] rail:overflow-visible rail:px-[11px]"
      >
        <button
          type="button"
          className="icon-btn absolute top-[17px] right-2 max-[760px]:hidden rail:relative rail:inset-auto rail:self-center"
          aria-expanded={!rail}
          aria-controls={id}
          onClick={toggleRail}
        >
          <svg {...iconProps}>
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="M9 4v16" />
          </svg>
          <span className={rail ? "side-label" : "sr-only"}>Toggle sidebar</span>
        </button>
        <button
          ref={closeRef}
          type="button"
          className="icon-btn absolute top-3 right-2 hidden max-[760px]:inline-flex"
          aria-label="Close menu"
          onClick={close}
        >
          <svg {...iconProps}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        {children}
      </aside>
    </>
  );
}
