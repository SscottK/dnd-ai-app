import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownRenderer({ content }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ ...props }) => (
          <div className="overflow-x-auto my-4 rounded-lg border border-amber-900/30">
            <table className="min-w-full text-xs divide-y divide-slate-800 bg-slate-950" {...props} />
          </div>
        ),
        thead: ({ ...props }) => <thead className="bg-amber-950/20 text-amber-500 font-semibold" {...props} />,
        th: ({ ...props }) => <th className="px-3 py-1.5 text-left" {...props} />,
        td: ({ ...props }) => <td className="px-3 py-1.5 text-slate-300 border-t border-slate-800" {...props} />,
        blockquote: ({ ...props }) => (
          <blockquote className="border-l-4 border-amber-600 bg-amber-950/10 pl-4 py-2 italic my-3 text-slate-300" {...props} />
        ),
        h1: ({ ...props }) => <h1 className="text-lg font-bold text-amber-500 mt-4 mb-2" {...props} />,
        h2: ({ ...props }) => <h2 className="text-md font-bold text-amber-400 mt-3 mb-2" {...props} />,
        h3: ({ ...props }) => <h3 className="font-semibold text-amber-500 mt-2 mb-1" {...props} />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}