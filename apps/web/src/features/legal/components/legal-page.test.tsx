import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalPage } from "./legal-page";

const sections = [
  { id: "age", title: "Age", body: <p>You must be 18 or older.</p> },
  { id: "proxy", title: "Your proxy", body: <p>You are responsible for your proxy.</p> },
];

function renderTerms() {
  render(<LegalPage current="/terms" lead="The rules of Wanderer." updated="2026-10-21" sections={sections} />);
}

describe("LegalPage", () => {
  it("shows the title of the current page and the date in words", () => {
    renderTerms();
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.getByText("21 October 2026")).toHaveAttribute("dateTime", "2026-10-21");
  });

  it("marks the current page in the switch and links to the other page", () => {
    renderTerms();
    const pages = within(screen.getByRole("navigation", { name: "Legal pages" }));
    expect(pages.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("aria-current", "page");
    expect(pages.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  it("links each section from the list of contents", () => {
    renderTerms();
    const contents = within(screen.getByRole("navigation", { name: "On this page" }));
    expect(contents.getByRole("link", { name: "Your proxy" })).toHaveAttribute("href", "#proxy");
    expect(screen.getByRole("heading", { level: 2, name: "Your proxy" }).closest("section")).toHaveAttribute(
      "id",
      "proxy",
    );
  });

  it("shows no draft label", () => {
    renderTerms();
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    expect(screen.queryByText(/legal knowledge/)).not.toBeInTheDocument();
  });
});
