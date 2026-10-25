import type { Html, Node, Parent, PhrasingContent, Root, RootContent } from "mdast";
import { useId } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { type Options as SanitizeSchema } from "rehype-sanitize";
import remarkGfm, { type Options as GfmOptions } from "remark-gfm";

/** The sanitizer puts this before each `id`, so a user `id` cannot replace a global of the page. */
const CLOBBER_PREFIX = "user-content-";

/**
 * The elements that Markdown and GFM make, plus `u` for the U button. rehype-raw changes raw HTML
 * into elements first, so this list also stops each other HTML element in the text. There is no
 * `img`, because the app shows text only and a remote image can track the reader.
 */
const schema: SanitizeSchema = {
  tagNames: [
    "p",
    "br",
    "strong",
    "em",
    "del",
    "u",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "hr",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "input",
    "sup",
    "section",
  ],
  attributes: {
    a: ["href", "title", "id", "ariaDescribedBy", "ariaLabel", "dataFootnoteRef", "dataFootnoteBackref"],
    th: ["align"],
    td: ["align"],
    // A task list item: a box that is checked or empty, and that the reader cannot change.
    input: [["type", "checkbox"], ["disabled", true], "checked"],
    li: ["id"],
    h2: ["id"],
    section: ["dataFootnotes"],
  },
  protocols: { href: ["http", "https", "mailto"] },
  strip: ["script", "style"],
  clobberPrefix: CLOBBER_PREFIX,
};

/** One open or close HTML tag, such as `<stats>` or `</stats>`. */
const TAG = String.raw`<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?>`;
const LEADING_TAGS = new RegExp(String.raw`^\s*(?:${TAG}\s*)+`);
const TRAILING_TAGS = new RegExp(String.raw`(?:${TAG}\s*)+$`);
/** A raw HTML block that CommonMark keeps raw up to its close tag, so the text inside stays raw. */
const RAW_BLOCK = /^\s*<(?:pre|script|style|textarea)[\s>]/i;

/** The start of a line, with the `>` marks of a quote. */
const LINE_START = String.raw`^([ \t]*(?:>[ \t]?)*)`;
const FENCE_MARK = String.raw`(?:\`{3,}|~{3,})`;
const TAGS_BEFORE_FENCE = new RegExp(String.raw`${LINE_START}((?:${TAG}[ \t]*)+)(${FENCE_MARK}.*)$`, "gm");
const FENCE_BEFORE_TAGS = new RegExp(String.raw`${LINE_START}(${FENCE_MARK})[ \t]*((?:${TAG}[ \t]*)+)$`, "gm");

/**
 * Moves a tag on the same line as a ``` or ~~~ mark to its own line, as in "<stats>```" or
 * "```</stats>". Some imported cards use this form. A Markdown fence must start a line, and its
 * close line must hold no other text. Without this step, the code block does not close.
 */
function splitTagsFromFences(text: string): string {
  return text
    .replace(TAGS_BEFORE_FENCE, (_, start: string, tags: string, fence: string) => `${start}${tags.trimEnd()}\n${start}${fence}`)
    .replace(FENCE_BEFORE_TAGS, (_, start: string, fence: string, tags: string) => `${start}${fence}\n${start}${tags.trimEnd()}`);
}

/**
 * Parses the Markdown inside each raw HTML block again. CommonMark starts an HTML block at a line
 * such as `<stats>` and keeps the next lines as raw text up to a blank line. Then a ``` block or
 * `**bold**` inside a tag from an imported card does not render. The plugin keeps the tags as raw
 * HTML and puts the parsed Markdown between them.
 */
function remarkMarkdownInTags(this: { parse(text: string): Node }) {
  const split = (parent: Parent) => {
    parent.children = parent.children.flatMap((node): RootContent[] => {
      if ("children" in node) split(node);
      if (node.type !== "html" || RAW_BLOCK.test(node.value)) return [node];
      const lead = LEADING_TAGS.exec(node.value)?.[0] ?? "";
      const rest = node.value.slice(lead.length);
      const trail = TRAILING_TAGS.exec(rest)?.[0] ?? "";
      const inner = rest.slice(0, rest.length - trail.length);
      // An inline tag such as `<u>` has no text inside, so it stays as it is.
      if (!lead || !inner.trim()) return [node];
      // remark-parse makes the tree, so the result is an mdast root.
      const root = this.parse(inner) as Root;
      split(root);
      const tags = (value: string): Html[] => (value.trim() ? [{ type: "html", value: value.trim() }] : []);
      return [...tags(lead), ...root.children, ...tags(trail)];
    });
  };
  return (tree: Root) => split(tree);
}

/** An open or close `<u>` tag, the only raw HTML that a code block shows as a format. */
const UNDERLINE_TAG = /^<\/?u>$/i;

/** Keeps bold, italic, strikethrough and underline. Each other part of the line gets its source text back. */
function keepFormats(node: PhrasingContent, line: string): PhrasingContent {
  if (node.type === "strong" || node.type === "emphasis" || node.type === "delete") {
    return { ...node, children: node.children.map((child) => keepFormats(child, line)) };
  }
  if (node.type === "html" && UNDERLINE_TAG.test(node.value)) return node;
  return { type: "text", value: line.slice(node.position?.start.offset, node.position?.end.offset) };
}

/**
 * Shows the text formats inside a ``` block with no language, such as the status block of an RPG
 * character. CommonMark shows a code block as it is, so `**Void Weaver**` shows its marks. The
 * plugin parses each line alone and keeps only the formats, so a list mark, a link or `5 * 2` stays
 * as the same text. A block with a language, such as ```python, stays as it is.
 */
function remarkFormatsInCode(this: { parse(text: string): Node }) {
  const formatLine = (line: string): PhrasingContent[] => {
    const indent = /^\s*/.exec(line)?.[0] ?? "";
    const rest = line.slice(indent.length);
    // remark-parse makes the tree, so the result is an mdast root.
    const { children } = this.parse(rest) as Root;
    const [block] = children;
    // A line that is not one paragraph, such as "- Sword" or "---", stays as text.
    if (children.length !== 1 || block?.type !== "paragraph") return [{ type: "text", value: line }];
    return [
      { type: "text", value: indent + rest.slice(0, block.position?.start.offset) },
      ...block.children.map((child) => keepFormats(child, rest)),
      { type: "text", value: rest.slice(block.position?.end.offset) },
    ];
  };
  const walk = (parent: Parent) => {
    parent.children = parent.children.map((node): RootContent => {
      if ("children" in node) walk(node);
      if (node.type !== "code" || node.lang) return node;
      const lines = node.value.split("\n").map(formatLine);
      if (lines.every((parts) => parts.every((part) => part.type === "text"))) return node;
      const text = lines.flatMap((parts, index): PhrasingContent[] => (index ? [{ type: "text", value: "\n" }, ...parts] : parts));
      // An mdast code node holds only text, so `hName` makes the same `pre > code` from nodes that
      // can hold formats. The last "\n" matches the text of a standard code block.
      return {
        type: "paragraph",
        data: { hName: "pre" },
        position: node.position,
        children: [{ type: "emphasis", data: { hName: "code" }, children: [...text, { type: "text", value: "\n" }] }],
      };
    });
  };
  return (tree: Root) => walk(tree);
}

/** GFM without the single `~` strikethrough, because roleplay text often has "Hello~" or "~sigh~". */
const gfm: GfmOptions = { singleTilde: false };

/**
 * Shows user text as Markdown with GFM: tables, ~~strikethrough~~, task lists, bare links, and
 * footnotes. The sanitizer runs last, so no raw HTML except `u` reaches the page.
 */
export function Markdown({ text }: { text: string }) {
  // Each message gets its own footnote ids, so a note link goes to the note of the same message.
  const footnotePrefix = `${useId()}-`;
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, gfm], remarkMarkdownInTags, remarkFormatsInCode]}
        remarkRehypeOptions={{ clobberPrefix: footnotePrefix }}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={{
          a: ({ node: _node, href, children, ...props }) =>
            // A footnote link goes to a place on the same page, so it stays in the same tab. The
            // sanitizer changed the id of that place, so the link gets the same prefix.
            href?.startsWith("#") ? (
              <a href={`#${CLOBBER_PREFIX}${href.slice(1)}`} {...props}>
                {children}
              </a>
            ) : (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            ),
        }}
      >
        {splitTagsFromFences(text)}
      </ReactMarkdown>
    </div>
  );
}

/** The text parts of each block, in order. A code block becomes inline code, so it stays on the line. */
function lineParts(node: RootContent | Root): PhrasingContent[][] {
  if (node.type === "paragraph" || node.type === "heading") return [node.children];
  if (node.type === "code") return [[{ type: "inlineCode", value: node.value }]];
  if (node.type === "html") return [[node]];
  return "children" in node ? (node.children as RootContent[]).flatMap(lineParts) : [];
}

/** Puts the text of all blocks in one paragraph, with a space between two blocks. */
function remarkOneLine() {
  return (tree: Root) => {
    const children = lineParts(tree).flatMap((part, index): PhrasingContent[] => (index ? [{ type: "text", value: " " }, ...part] : part));
    tree.children = [{ type: "paragraph", children }];
  };
}

/** The formatting that a one-line preview keeps. Other elements give only their text. */
const INLINE_ELEMENTS = ["strong", "em", "del", "u", "code"];

/**
 * Shows user text as one line of Markdown, for a preview such as the last message of a chat.
 * It keeps bold, italic, strikethrough, underline, and code. The same sanitizer as `Markdown` runs.
 */
export function InlineMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkOneLine]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
      allowedElements={INLINE_ELEMENTS}
      unwrapDisallowed
    >
      {text}
    </ReactMarkdown>
  );
}
