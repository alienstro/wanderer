import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SidebarDrawer } from "./sidebar-drawer";

/** Renders the drawer with one link, as the sidebar holds links. */
function renderDrawer() {
  render(
    <SidebarDrawer>
      <a href="#discover">Discover</a>
    </SidebarDrawer>,
  );
  return { menu: screen.getByRole("button", { name: "Open menu" }), sidebar: screen.getByRole("complementary") };
}

describe("sidebar drawer", () => {
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
