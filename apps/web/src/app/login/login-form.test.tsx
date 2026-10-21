import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

function googleLink(): HTMLElement {
  const link = screen.getByText("Continue with Google").closest("a");
  if (!link) throw new Error("no Google link");
  return link;
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://wanderer-api.alienstro.xyz");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("the Google link has no href before the box is ticked", () => {
    render(<LoginForm />);
    expect(googleLink()).not.toHaveAttribute("href");
    expect(googleLink()).toHaveAttribute("aria-disabled", "true");
  });

  it("after the box is ticked, the href ends with /auth/google?terms=2026-10-21", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(googleLink().getAttribute("href")).toBe(
      "https://wanderer-api.alienstro.xyz/auth/google?terms=2026-10-21",
    );
    expect(googleLink()).not.toHaveAttribute("aria-disabled", "true");
  });

  it("the checkbox label links to /terms and /privacy", () => {
    render(<LoginForm />);
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  it('error="banned" shows "This account is banned."', () => {
    render(<LoginForm error="banned" />);
    expect(screen.getByRole("alert")).toHaveTextContent("This account is banned.");
  });

  it('error="account" says that the email belongs to another account', () => {
    render(<LoginForm error="account" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This Google email address belongs to another Wanderer account.",
    );
  });
});
