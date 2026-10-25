import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminNav } from "@/features/admin/components/admin-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin/models" }));

describe("AdminNav", () => {
  it("links the four admin pages and marks the current page", () => {
    render(<AdminNav />);
    const links = screen.getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Reports", "/admin"],
      ["Overview", "/admin/overview"],
      ["Energy and models", "/admin/models"],
      ["User energy", "/admin/users"],
    ]);
    expect(screen.getByRole("link", { name: "Energy and models" }).getAttribute("aria-current")).toBe("page");
  });
});
