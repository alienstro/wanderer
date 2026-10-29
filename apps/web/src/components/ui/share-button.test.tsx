import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "./share-button";
import { Toaster } from "./toaster";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ShareButton", () => {
  it("opens the share sheet of the device with the title and the full link, when the browser has one", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    render(<ShareButton title="Captain Ilse Varga" path="/characters/c1" />);
    await userEvent.click(screen.getByRole("button", { name: "Share this character" }));
    expect(share).toHaveBeenCalledWith({ title: "Captain Ilse Varga", url: `${window.location.origin}/characters/c1` });
    Reflect.deleteProperty(navigator, "share");
  });

  it('copies the link and shows "Link copied" when the browser has no share sheet', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ShareButton title="Captain Ilse Varga" path="/characters/c1" />
        <Toaster />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Share this character" }));
    await expect(navigator.clipboard.readText()).resolves.toBe(`${window.location.origin}/characters/c1`);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });
});
