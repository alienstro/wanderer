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

/** Shows user text as Markdown. The sanitizer runs last, so no raw HTML except `u` reaches the page. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
