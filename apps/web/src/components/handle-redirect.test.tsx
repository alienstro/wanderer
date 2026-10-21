import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HandleRedirect } from "./handle-redirect";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const me = { id: "u1", name: "Tian", email: "tian@example.com", pictureUrl: null, role: "user" };

function renderWithMe(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body, { status })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HandleRedirect />
    </QueryClientProvider>,
  );
}

describe("HandleRedirect", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a logged-in user without a handle to /onboarding", async () => {
    renderWithMe({ ...me, handle: null, suggestedHandle: "tian" });
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("keeps a user with a handle on the page", async () => {
    renderWithMe({ ...me, handle: "tian", suggestedHandle: null });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps a visitor without a session on the page", async () => {
    renderWithMe({ error: "unauthorized" }, 401);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(replace).not.toHaveBeenCalled();
  });
});
