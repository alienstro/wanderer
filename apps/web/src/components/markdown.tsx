import type { Html, Node, Parent, Root, RootContent } from "mdast";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { type Options as SanitizeSchema } from "rehype-sanitize";

/**
 * The elements that Markdown makes, plus `u` for the U button. rehype-raw changes raw HTML into
 * elements first, so this list also stops each other HTML element in the text.
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
  ],
  attributes: { a: ["href", "title"] },
  protocols: { href: ["http", "https", "mailto"] },
  strip: ["script", "style"],
  clobberPrefix: "user-content-",
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

/** Shows user text as Markdown. The sanitizer runs last, so no raw HTML except `u` reaches the page. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkMarkdownInTags]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={{
          a: ({ href, children }) => (
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
