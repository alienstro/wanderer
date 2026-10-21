import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportButton } from "./report-dialog";

function stubFetch(status = 201, body: unknown = { id: "r1" }) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function openDialog() {
  render(<ReportButton characterId="c1" />);
  await userEvent.click(screen.getByRole("button", { name: "Report" }));
  return screen.getByRole("dialog", { name: "Report this character" });
}

describe("ReportButton", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the 5 reasons, and Send stays disabled until the user picks one", async () => {
    stubFetch();
    await openDialog();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "Sexual content with minors" })).toBeTruthy();
    const send = screen.getByRole("button", { name: "Send report" });
    expect(send.hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: "Hate or harassment" }));
    expect(send.hasAttribute("disabled")).toBe(false);
  });

  it("sends the reason and the note, and then thanks the user", async () => {
    const fetchMock = stubFetch();
    await openDialog();
    await userEvent.click(screen.getByRole("radio", { name: "Copied character" }));
    await userEvent.type(screen.getByLabelText("Note (optional)"), "From another site.");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/characters/c1/report");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ reason: "copied", note: "From another site." });
    expect(await screen.findByText("Thanks. The admin will look at it.")).toBeTruthy();
  });

  it("shows a clear text for 409 and for 429", async () => {
    stubFetch(409, { error: "already_reported" });
    await openDialog();
    await userEvent.click(screen.getByRole("radio", { name: "Other" }));
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText("You already reported this character.")).toBeTruthy();

    stubFetch(429, { error: "report_limit" });
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));
    expect(await screen.findByText("You sent too many reports today. Try again tomorrow.")).toBeTruthy();
  });

  it("counts the note and stops it at 500 characters", async () => {
    stubFetch();
    await openDialog();
    expect(screen.getByText("0 / 500")).toBeTruthy();
    const note = screen.getByLabelText("Note (optional)");
    expect(note.getAttribute("maxlength")).toBe("500");
  });

  it("closes with the Close button and with Escape", async () => {
    stubFetch();
    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Report" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
