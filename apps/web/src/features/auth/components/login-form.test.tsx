import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TERMS_VERSION } from "@wanderer/shared";
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

  it("after the box is ticked, the href ends with /auth/google?terms=<current version>", async () => {
    render(<LoginForm />);
    await userEvent.click(screen.getByRole("checkbox"));
    expect(googleLink().getAttribute("href")).toBe(
      `https://wanderer-api.alienstro.xyz/auth/google?terms=${TERMS_VERSION}`,
    );
    expect(googleLink()).not.toHaveAttribute("aria-disabled", "true");
  });

  it("the checkbox label links to /terms and /privacy", () => {
    render(<LoginForm />);
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  it("the checkbox confirms that the user is 18 or older", () => {
    render(<LoginForm />);
    expect(
      screen.getByRole("checkbox", {
        name: /^I am 18 or older\. I understand that the characters are AI, and that the chats are fiction\. I agree to the Terms/,
      }),
    ).toBeInTheDocument();
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
