import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// spec-rendu-markdown-conversation.md — renders an assistant message's
// markdown (bold, italic, lists, headings, inline/block code, links,
// paragraphs). Server Component: `react-markdown`'s default export renders
// synchronously, no client hooks. Raw HTML in the content is never
// interpreted: no `rehype-raw`, so react-markdown 10 shows it as plain,
// escaped text (the model's output must not be able to inject tags). The
// default `urlTransform` also neutralises unsafe URL schemes
// (`javascript:` etc.). Images are never rendered as `<img>` (not in the
// spec's element list, and a remote image URL in model output would be
// fetched on display — a data-exfiltration vector): the alt text, or the
// URL when alt is empty, is shown as plain text instead. No syntax
// highlighting (spec Never).
const components: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
  img: ({ alt, src }) => <>{alt || (typeof src === 'string' ? src : '')}</>,
};

export function MessageContent({ content }: { content: string }) {
  return (
    <div className="text-body message-markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  );
}
