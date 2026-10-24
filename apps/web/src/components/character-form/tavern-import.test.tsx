import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TavernImport } from "./tavern-import";

const draft = { title: "Mira", openings: ["Hi."] };

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function pick(file: File) {
  await userEvent.upload(screen.getByLabelText("Import a character card"), file);
}

describe("TavernImport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a JSON card is sent as the body of import-json, and the draft comes back with no avatar", async () => {
    const fetchMock = stubFetch(200, { draft });
    const onImported = vi.fn();
    render(<TavernImport onImported={onImported} />);
    const text = JSON.stringify({ spec: "chara_card_v2", data: { name: "Mira", first_mes: "Hi." } });

    await pick(new File([text], "mira.json", { type: "application/json" }));

    await vi.waitFor(() => expect(onImported).toHaveBeenCalledWith(draft, undefined));
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/characters\/import-json$/);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(text);
  });

  it("a PNG card still goes to import-png and keeps the avatar", async () => {
    const fetchMock = stubFetch(200, { draft, avatarFileId: "f1" });
    const onImported = vi.fn();
    render(<TavernImport onImported={onImported} />);

    await pick(new File([new Uint8Array([1, 2, 3])], "mira.png", { type: "image/png" }));

    await vi.waitFor(() => expect(onImported).toHaveBeenCalledWith(draft, "f1"));
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/characters\/import-png$/);
  });

  it("a JSON file that is not valid JSON shows an error and sends nothing", async () => {
    const fetchMock = stubFetch(200, { draft });
    const onImported = vi.fn();
    render(<TavernImport onImported={onImported} />);

    await pick(new File(["{broken"], "mira.json", { type: "application/json" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This file is not valid JSON.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });

  it("a JSON with no card shows that the file has no character card", async () => {
    stubFetch(400, { error: "no_character_card" });
    render(<TavernImport onImported={vi.fn()} />);

    await pick(new File(['{"hello":"world"}'], "other.json", { type: "application/json" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This file has no character card.");
  });

  it("a 413 answer shows the size limit", async () => {
    stubFetch(413, {});
    render(<TavernImport onImported={vi.fn()} />);

    await pick(new File(['{"name":"Mira"}'], "mira.json", { type: "application/json" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Use a card file of 2 MB or less.");
  });
});
