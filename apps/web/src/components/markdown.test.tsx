import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

describe("Markdown", () => {
  it("**bold**, *italic*, <u>under</u>, and [link](https://a.b) render as strong, em, u, and a", () => {
    const { container } = render(<Markdown text={"**bold** *italic* <u>under</u> [link](https://a.b)"} />);
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("italic");
    expect(container.querySelector("u")).toHaveTextContent("under");
    expect(container.querySelector("a")).toHaveAttribute("href", "https://a.b");
  });

  it("<script>, <img onerror>, and a javascript: link render as plain text or nothing", () => {
    const { container } = render(
      <Markdown text={'<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n[bad](javascript:alert(3))\n\n<b>b</b>'} />,
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href") ?? null).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.innerHTML).not.toContain("javascript:");
  });
});
