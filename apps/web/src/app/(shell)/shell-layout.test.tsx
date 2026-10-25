import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShellLayout from "./layout";

let sidebarCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "wanderer_sidebar" && sidebarCookie ? { name, value: sidebarCookie } : undefined) }),
}));
// The shell shows only the state that the layout gives it. The sidebar tests check the shell itself.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, defaultRail }: { children: ReactNode; defaultRail: boolean }) => (
    <div data-testid="shell" data-rail={defaultRail}>
      {children}
    </div>
  ),
}));
vi.mock("@/features/auth/components/handle-redirect", () => ({ HandleRedirect: () => null }));

async function renderLayout() {
  render((await ShellLayout({ children: <p>Page</p> })) as ReactElement);
  return screen.getByTestId("shell");
}

describe("shell layout", () => {
  beforeEach(() => {
    sidebarCookie = undefined;
  });

  it("starts with the full sidebar when the user has no saved choice", async () => {
    expect(await renderLayout()).toHaveAttribute("data-rail", "false");
  });

  it("starts with the rail when the cookie keeps the rail", async () => {
    sidebarCookie = "rail";
    expect(await renderLayout()).toHaveAttribute("data-rail", "true");
  });

  it("starts with the full sidebar when the cookie keeps the full sidebar", async () => {
    sidebarCookie = "full";
    expect(await renderLayout()).toHaveAttribute("data-rail", "false");
  });
});
