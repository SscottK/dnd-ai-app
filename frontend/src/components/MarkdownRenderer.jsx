import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

const markdownComponents = {
  table: ({ ...props }) => (
    <div className="my-3 overflow-x-auto rounded border border-border/60 bg-black/30">
      <table className="min-w-full divide-y divide-border text-xs" {...props} />
    </div>
  ),
  thead: ({ ...props }) => <thead className="bg-void-panel text-neon-cyan" {...props} />,
  th: ({ ...props }) => <th className="px-2 py-1.5 text-left font-black uppercase" {...props} />,
  td: ({ ...props }) => <td className="border-t border-border/40 px-2 py-1.5 text-ink-muted" {...props} />,
  hr: () => <hr className="my-3 border-border/60" />,
  blockquote: ({ ...props }) => (
    <blockquote
      className="my-3 border-l-2 border-neon-cyan/50 bg-neon-cyan/5 py-2 pl-3 text-ink-muted italic"
      {...props}
    />
  ),
  h1: ({ ...props }) => <h1 className="mt-4 mb-2 text-base font-black text-starlight" {...props} />,
  h2: ({ ...props }) => <h2 className="mt-3 mb-2 text-sm font-black text-starlight" {...props} />,
  h3: ({ ...props }) => (
    <h3 className="mt-3 mb-1 text-xs font-black uppercase tracking-wider text-neon-cyan" {...props} />
  ),
  p: ({ ...props }) => <p className="my-2 leading-relaxed" {...props} />,
  ul: ({ ...props }) => <ul className="my-2 list-disc space-y-1 pl-4" {...props} />,
  li: ({ ...props }) => <li className="leading-relaxed" {...props} />,
  strong: ({ ...props }) => <strong className="font-black text-starlight" {...props} />,
  em: ({ ...props }) => <em className="text-neon-cyan not-italic" {...props} />,
};

export function MarkdownRenderer({ content }) {
  if (!content) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={markdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}
