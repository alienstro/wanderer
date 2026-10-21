import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HandleForm } from "./handle-form";

const me = {
  id: "u1",
  name: "Tian",
  email: "tian@example.com",
  pictureUrl: null,
  handle: "tian",
  role: "user",
  suggestedHandle: null,
};

function fakeFetch(response: () => Response) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("HandleForm", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://wanderer-api.alienstro.xyz");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("the field starts with the suggested handle", () => {
    render(<HandleForm suggested="tian_lee" onDone={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("tian_lee");
  });

  it('an invalid handle shows "Use 3 to 20 lowercase letters, numbers, or _." and sends no request', async () => {
    const fetchMock = fakeFetch(() => Response.json(me));
    render(<HandleForm suggested="tian_lee" onDone={() => {}} />);
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "ti an");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Use 3 to 20 lowercase letters, numbers, or _.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a 409 handle_taken answer shows "This handle is taken."', async () => {
    fakeFetch(() => Response.json({ error: "handle_taken" }, { status: 409 }));
    const onDone = vi.fn();
    render(<HandleForm suggested="tian" onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("This handle is taken.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a 200 answer calls onDone", async () => {
    const fetchMock = fakeFetch(() => Response.json(me));
    const onDone = vi.fn();
    render(<HandleForm suggested="tian" onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith(me));
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ handle: "tian" }));
  });
});
