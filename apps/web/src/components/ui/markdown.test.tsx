import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InlineMarkdown, Markdown } from "@/components/ui/markdown";

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

  it("a ``` block inside a custom tag such as <stats> renders as a code block, one field on each line", () => {
    const text = '*Check your status.*\n\n<stats>\n```\nPhysical status: Fine\nInventory: ["Divine Symbol"]\n```\n</stats>';
    const { container } = render(<Markdown text={text} />);
    expect(container.querySelector("em")).toHaveTextContent("Check your status.");
    expect(container.querySelector("pre code")?.textContent).toBe('Physical status: Fine\nInventory: ["Divine Symbol"]\n');
    expect(container.textContent).not.toContain("```");
    expect(container.textContent).not.toContain("stats>");
  });

  it("bold, a list, and a ~~~ block inside a custom tag with attributes render as Markdown", () => {
    const text = '<status type="rpg">\n**HP:** 10\n\n- Sword\n- Shield\n\n~~~\nGold: 0G\n~~~\n</status>';
    const { container } = render(<Markdown text={text} />);
    expect(container.querySelector("strong")).toHaveTextContent("HP:");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("pre code")?.textContent).toBe("Gold: 0G\n");
    expect(container.textContent).not.toContain("status");
  });

  it("a ``` block inside a custom tag in a quote renders as a code block", () => {
    const { container } = render(<Markdown text={"> <stats>\n> ```\n> Gold: 0G\n> ```\n> </stats>"} />);
    expect(container.querySelector("blockquote pre code")?.textContent).toBe("Gold: 0G\n");
    expect(container.textContent).not.toContain("```");
  });

  it("Markdown after a block tag with text on the same line, such as <summary>, renders", () => {
    const { container } = render(<Markdown text={"<details>\n<summary>Status</summary>\n**HP:** 10\n- Sword\n</details>"} />);
    expect(container.querySelector("strong")).toHaveTextContent("HP:");
    expect(container.querySelector("li")).toHaveTextContent("Sword");
  });

  it("two custom tags in a row, each with a ``` block, render as two code blocks", () => {
    const text = "<stats>\n```\nGold: 0G\n```\n</stats>\n<quest>\n```\nFind the god\n```\n</quest>";
    const { container } = render(<Markdown text={text} />);
    const blocks = [...container.querySelectorAll("pre code")].map((code) => code.textContent);
    expect(blocks).toEqual(["Gold: 0G\n", "Find the god\n"]);
    expect(container.textContent).not.toContain("quest>");
  });

  it("a custom tag on the same line as the ``` marks renders as a code block", () => {
    const { container } = render(<Markdown text={"<stats>```text\nGold: 0G\nLevel: 1\n```</stats>\n\nThe road waits."} />);
    expect(container.querySelector("pre code")?.textContent).toBe("Gold: 0G\nLevel: 1\n");
    expect(container.querySelector("p")).toHaveTextContent("The road waits.");
    expect(container.textContent).not.toContain("```");
    expect(container.textContent).not.toContain("stats>");
  });

  it("a custom tag on the same line as the ``` marks in a quote renders as a code block", () => {
    const { container } = render(<Markdown text={"> <stats>```\n> Gold: 0G\n> ```</stats>"} />);
    expect(container.querySelector("blockquote pre code")?.textContent).toBe("Gold: 0G\n");
    expect(container.textContent).not.toContain("```");
  });

  it("a tag line inside a ``` block stays as the same code text", () => {
    const { container } = render(<Markdown text={"```\n<stats>\nGold: 0G\n</stats>\n```"} />);
    expect(container.querySelector("pre code")?.textContent).toBe("<stats>\nGold: 0G\n</stats>\n");
  });

  it("a tag line inside a raw <pre> block stays as the same text", () => {
    const { container } = render(<Markdown text={"<pre>\n<stats>\nGold: 0G\n</stats>\n</pre>"} />);
    expect(container.querySelector("pre")?.textContent).toBe("\nGold: 0G\n\n");
  });

  it("a standard ``` block and an inline `code` span render as before", () => {
    const { container } = render(<Markdown text={"Use `roll`.\n\n```\nd20\n```"} />);
    expect(container.querySelector("p code")).toHaveTextContent("roll");
    expect(container.querySelector("pre code")?.textContent).toBe("d20\n");
  });

  it("bold, italic, bold italic, strikethrough, and underline inside a ``` block with no language render with no marks", () => {
    const text = "```\nBold: **Void Weaver**\nItalic: *a faint golden hue* _and_\nBold italic: ***Blink***\nStrikethrough: ~~Wallet~~\nUnderline: <u>Asteria</u>\n```";
    const { container } = render(<Markdown text={text} />);
    const code = container.querySelector("pre code");
    expect(code?.querySelector("strong")).toHaveTextContent("Void Weaver");
    expect([...(code?.querySelectorAll("em") ?? [])].map((em) => em.textContent)).toEqual(["a faint golden hue", "and", "Blink"]);
    expect(code?.querySelector("em strong, strong em")).toHaveTextContent("Blink");
    expect(code?.querySelector("del")).toHaveTextContent("Wallet");
    expect(code?.querySelector("u")).toHaveTextContent("Asteria");
    expect(code?.textContent).toBe(
      "Bold: Void Weaver\nItalic: a faint golden hue and\nBold italic: Blink\nStrikethrough: Wallet\nUnderline: Asteria\n",
    );
  });

  it("a ``` block inside a custom tag such as <stats> renders the bold names with no marks", () => {
    const text = '<stats>\n```\nClass: **Void Weaver**\nSpells: ["**Void Touch** — Erase", "**Blink** — Move"]\n```\n</stats>';
    const { container } = render(<Markdown text={text} />);
    const bold = [...container.querySelectorAll("pre code strong")].map((strong) => strong.textContent);
    expect(bold).toEqual(["Void Weaver", "Void Touch", "Blink"]);
    expect(container.querySelector("pre code")?.textContent).toBe('Class: Void Weaver\nSpells: ["Void Touch — Erase", "Blink — Move"]\n');
  });

  it("a * with no closing pair and other Markdown inside a ``` block stay as the same text", () => {
    const text = "```\nHP: 5 * 2\n- Sword\n[map](https://a.b) `d20` \\*x\\* &amp; <b>b</b>\nClass: **Mage**\n```";
    const { container } = render(<Markdown text={text} />);
    expect(container.querySelector("pre code")?.textContent).toBe(
      "HP: 5 * 2\n- Sword\n[map](https://a.b) `d20` \\*x\\* &amp; <b>b</b>\nClass: Mage\n",
    );
    expect(container.querySelector("pre code a, pre code b, pre code code, li")).toBeNull();
  });

  it("a ``` block with a language, such as python, keeps the ** marks", () => {
    const { container } = render(<Markdown text={"```python\nx = 2**3\ny = **kwargs**\n```"} />);
    expect(container.querySelector("pre code")?.textContent).toBe("x = 2**3\ny = **kwargs**\n");
    expect(container.querySelector("pre code strong")).toBeNull();
  });

  it("a pipe table renders as a table, with one row for each line", () => {
    const text = "| Item | Cost |\n|------|------|\n| **Starter Pack** | FREE |\n| Map | 50G |";
    const { container } = render(<Markdown text={text} />);
    expect(container.querySelectorAll("table thead th")).toHaveLength(2);
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(2);
    expect(container.querySelector("tbody td strong")).toHaveTextContent("Starter Pack");
    expect(container.textContent).not.toContain("|");
  });

  it("a single ~ in roleplay text, such as Hello~ and ~sigh~, stays as text", () => {
    const { container } = render(<Markdown text={"Hello~ ~sigh~ and ~~gone~~"} />);
    expect(container.querySelectorAll("del")).toHaveLength(1);
    expect(container.querySelector("del")).toHaveTextContent("gone");
    expect(container.textContent).toContain("Hello~ ~sigh~");
  });

  it("a task list renders a checked and an empty box that the reader cannot change", () => {
    const { container } = render(<Markdown text={"- [x] Find the sword\n- [ ] Pay the inn"} />);
    const boxes = container.querySelectorAll<HTMLInputElement>('li input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).not.toBeChecked();
    expect(boxes[0]).toBeDisabled();
  });

  it("a bare https URL renders as a link that opens in a new tab", () => {
    const { container } = render(<Markdown text={"See https://example.com now."} />);
    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("a footnote link points to the note id and stays in the same tab", () => {
    const { container } = render(<Markdown text={"A rumor.[^1]\n\n[^1]: From the inn."} />);
    const ref = container.querySelector("sup a");
    const href = ref?.getAttribute("href") ?? "";
    expect(href.startsWith("#")).toBe(true);
    expect(ref).not.toHaveAttribute("target");
    expect(container.querySelector(`[id="${href.slice(1)}"]`)).toHaveTextContent("From the inn.");
  });
});

describe("InlineMarkdown", () => {
  it("keeps italic, bold, strikethrough, underline, and code on one line, with no paragraph", () => {
    // The chat view has no ~~ syntax, so the preview gets a strikethrough from a <del> tag, as the chat does.
    const { container } = render(<InlineMarkdown text={"*waves* **Hi** <del>no</del> <u>yes</u> `d20`"} />);
    expect(container.querySelector("em")?.textContent).toBe("waves");
    expect(container.querySelector("strong")?.textContent).toBe("Hi");
    expect(container.querySelector("del")?.textContent).toBe("no");
    expect(container.querySelector("u")?.textContent).toBe("yes");
    expect(container.querySelector("code")?.textContent).toBe("d20");
    expect(container.querySelector("p")).toBeNull();
  });

  it("joins the lines with a space and shows a heading, a list, and a link as plain text", () => {
    const { container } = render(<InlineMarkdown text={"# Day 1\n- a [map](https://example.com)\n\nEnd"} />);
    expect(container.textContent).toBe("Day 1 a map End");
    expect(container.querySelector("h1, ul, li, a")).toBeNull();
  });

  it("drops a script tag and keeps the text around it", () => {
    const { container } = render(<InlineMarkdown text={"Hi <script>alert(1)</script>there"} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe("Hi there");
  });
});
