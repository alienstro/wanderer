import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SidebarDrawer } from "./sidebar-drawer";

/** Renders the drawer with one link, as the sidebar holds links. */
function renderDrawer(defaultRail = false) {
  render(
    <SidebarDrawer defaultRail={defaultRail}>
      <a href="#discover">Discover</a>
    </SidebarDrawer>,
  );
  return { menu: screen.getByRole("button", { name: "Open menu" }), sidebar: screen.getByRole("complementary") };
}

describe("sidebar drawer", () => {
  beforeEach(() => {
    document.cookie = "wanderer_sidebar=; Max-Age=0; Path=/";
  });

  it("the menu button opens the sidebar and moves the focus into it", async () => {
    const { menu, sidebar } = renderDrawer();
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAttribute("aria-controls", sidebar.id);
    expect(sidebar).toHaveAttribute("data-open", "false");

    await userEvent.click(menu);

    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(sidebar).toHaveAttribute("data-open", "true");
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus();
  });

  it("the Close menu button and the Escape key close the sidebar and give the focus back to the menu button", async () => {
    const { menu, sidebar } = renderDrawer();
    await userEvent.click(menu);
    await userEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(sidebar).toHaveAttribute("data-open", "false");
    expect(menu).toHaveFocus();

    await userEvent.click(menu);
    await userEvent.keyboard("{Escape}");
    expect(sidebar).toHaveAttribute("data-open", "false");
    expect(menu).toHaveFocus();
  });

  it("a click on a link in the sidebar closes the sidebar", async () => {
    const { menu, sidebar } = renderDrawer();
    await userEvent.click(menu);
    await userEvent.click(screen.getByRole("link", { name: "Discover" }));
    expect(sidebar).toHaveAttribute("data-open", "false");
  });
});

describe("sidebar rail", () => {
  beforeEach(() => {
    document.cookie = "wanderer_sidebar=; Max-Age=0; Path=/";
  });

  it("the toggle button changes the full sidebar to the rail and back, and keeps the focus", async () => {
    const { sidebar } = renderDrawer();
    const toggle = screen.getByRole("button", { name: "Toggle sidebar" });
    expect(toggle).toHaveAttribute("aria-controls", sidebar.id);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(sidebar).toHaveAttribute("data-rail", "false");

    await userEvent.click(toggle);

    expect(sidebar).toHaveAttribute("data-rail", "true");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();

    await userEvent.click(toggle);

    expect(sidebar).toHaveAttribute("data-rail", "false");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveFocus();
  });

  it("keeps the choice in a cookie for the next visit", async () => {
    renderDrawer();
    const toggle = screen.getByRole("button", { name: "Toggle sidebar" });

    await userEvent.click(toggle);
    expect(document.cookie).toContain("wanderer_sidebar=rail");

    await userEvent.click(toggle);
    expect(document.cookie).toContain("wanderer_sidebar=full");
  });

  it("starts as the rail when the saved choice is the rail", () => {
    const { sidebar } = renderDrawer(true);
    expect(sidebar).toHaveAttribute("data-rail", "true");
    expect(screen.getByRole("button", { name: "Toggle sidebar" })).toHaveAttribute("aria-expanded", "false");
  });
});
