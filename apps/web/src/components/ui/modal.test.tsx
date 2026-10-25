import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal, useCloseModal } from "@/components/ui/modal";

/** A close transition that ends when the test calls `end`. jsdom has no animations, so the stub gives one. */
function stubCloseAnimation() {
  let end = () => {};
  const finished = new Promise<void>((resolve) => {
    end = resolve;
  });
  HTMLDialogElement.prototype.getAnimations = () => [{ finished } as unknown as Animation];
  return { end: () => act(async () => end()) };
}

function CancelButton() {
  const close = useCloseModal();
  return (
    <button type="button" onClick={close}>
      Cancel
    </button>
  );
}

describe("Modal", () => {
  afterEach(() => {
    delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).getAnimations;
  });

  it("opens as a dialog with the title as its name", () => {
    render(
      <Modal title="Memory" onClose={() => {}}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog", { name: "Memory" })).toHaveAttribute("open");
  });

  it("stays open in StrictMode, where React mounts the effect two times", async () => {
    const onClose = vi.fn();
    render(
      <StrictMode>
        <Modal title="Memory" onClose={onClose}>
          <p>Body</p>
        </Modal>
      </StrictMode>,
    );
    await act(async () => {});
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveAttribute("open");
  });

  it("calls onClose only after the close animation ends", async () => {
    const animation = stubCloseAnimation();
    const onClose = vi.fn();
    render(
      <Modal title="Report" closeButton onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).not.toHaveBeenCalled();
    await animation.end();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes from a button inside the content", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Edit persona" onClose={onClose}>
        <CancelButton />
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the browser closes the dialog, as on the Escape key", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Your chats" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    await act(async () => (screen.getByRole("dialog") as HTMLDialogElement).close());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a click on the backdrop", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Memory" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    // A click on the ::backdrop has the <dialog> element as its target.
    fireEvent.pointerDown(dialog);
    await act(async () => fireEvent.click(dialog));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when a drag starts in the panel and ends on the backdrop", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="Memory" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    fireEvent.pointerDown(screen.getByText("Body"));
    await act(async () => fireEvent.click(screen.getByRole("dialog")));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose one time for two quick close requests", async () => {
    const animation = stubCloseAnimation();
    const onClose = vi.fn();
    render(
      <Modal title="Report" closeButton onClose={onClose}>
        <CancelButton />
      </Modal>,
    );
    const closeButton = screen.getByRole("button", { name: "Close" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(closeButton);
    fireEvent.click(cancel);
    await animation.end();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
