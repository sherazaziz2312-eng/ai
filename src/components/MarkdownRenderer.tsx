import React, { useEffect, useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import mermaid from 'mermaid';
import { Check, Copy, Play, Code2, Download } from 'lucide-react';
import type { CodeArtifact } from '../types';
import { isPreviewableLanguage } from '../utils/fileProcessing';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
});

interface MarkdownRendererProps {
  content: string;
  messageId: string;
  onOpenArtifact: (artifact: CodeArtifact) => void;
}

function deriveBlockTitle(lang: string, code: string, index: number): string {
  const firstLine = code.split('\n')[0]?.trim() || '';
  const commentMatch = firstLine.match(/^(?:\/\/|#|<!--|\/\*|%%)\s*(.+?)(?:-->|\*\/)?$/);
  if (commentMatch && commentMatch[1].length >= 3 && commentMatch[1].length <= 48) {
    return commentMatch[1].trim();
  }
  if (lang === 'html' || lang === 'htm') {
    const titleTag = code.match(/<title>([\s\S]*?)<\/title>/i);
    return titleTag?.[1]?.trim() || `Web App Artifact ${index + 1}`;
  }
  if (lang === 'jsx' || lang === 'tsx' || lang === 'react') {
    const fnMatch = code.match(/(?:export\s+default\s+)?function\s+([A-Z][A-Za-z0-9_]*)/);
    return fnMatch?.[1] ? `${fnMatch[1]} Component` : `React Component ${index + 1}`;
  }
  if (lang === 'vue') return `Vue Component ${index + 1}`;
  if (lang === 'svg') return `Vector Graphic ${index + 1}`;
  if (lang === 'mermaid') return `Diagram ${index + 1}`;
  if (lang === 'latex' || lang === 'tex') return `LaTeX Document ${index + 1}`;
  if (lang === 'diff' || lang === 'patch') return `Patch Diff ${index + 1}`;
  if (lang === 'python' || lang === 'py') return `Python Script ${index + 1}`;
  return `${lang.toUpperCase()} Artifact ${index + 1}`;
}

const MermaidDiagramBlock: React.FC<{
  code: string;
  onOpenPreview: () => void;
}> = ({ code, onOpenPreview }) => {
  const uid = useId().replace(/:/g, '_');
  const [svgHtml, setSvgHtml] = useState<string>('');
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const renderDiagram = async () => {
      try {
        const { svg } = await mermaid.render(`mermaid_${uid}`, code);
        if (active) {
          setSvgHtml(svg);
          setRenderFailed(false);
        }
      } catch {
        if (active) setRenderFailed(true);
      }
    };
    void renderDiagram();
    return () => {
      active = false;
    };
  }, [code, uid]);

  return (
    <div className="my-4 rounded-xl border border-zinc-200 dark:border-white/[0.08] overflow-hidden bg-[#09090B] text-zinc-100">
      <div className="flex items-center justify-between gap-3 px-3.5 py-2 bg-[#111114] border-b border-white/[0.07] text-xs text-zinc-300">
        <span className="font-mono font-medium text-zinc-200">mermaid diagram</span>
        <button
          type="button"
          onClick={onOpenPreview}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Play className="w-3 h-3" />
          Preview
        </button>
      </div>
      {svgHtml && !renderFailed ? (
        <div
          className="p-4 overflow-x-auto flex justify-center bg-[#09090B]"
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      ) : (
        <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-zinc-100 m-0">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
};

function getFileExtension(lang: string): string {
  const map: Record<string, string> = {
    html: 'html',
    htm: 'html',
    jsx: 'jsx',
    tsx: 'tsx',
    vue: 'vue',
    typescript: 'ts',
    ts: 'ts',
    javascript: 'js',
    js: 'js',
    python: 'py',
    py: 'py',
    svg: 'svg',
    mermaid: 'mmd',
    css: 'css',
    sql: 'sql',
    json: 'json',
    markdown: 'md',
    md: 'md',
    latex: 'tex',
    tex: 'tex',
    diff: 'diff',
    patch: 'patch',
    bash: 'sh',
    sh: 'sh',
    shell: 'sh',
    c: 'c',
    cpp: 'cpp',
    'c++': 'cpp',
    cc: 'cpp',
  };
  return map[lang.toLowerCase()] || 'txt';
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  messageId,
  onOpenArtifact,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (code: string, key: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  const handleDownload = (code: string, lang: string) => {
    const ext = getFileExtension(lang);
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kestrel-artifact.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  let codeBlockCounter = 0;

  return (
    <div className="ai-prose break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          code({ className, children, ...props }) {
            const match = /language-([a-zA-Z0-9_+-]+)/.exec(className || '');
            const rawCode = String(children).replace(/\r\n/g, '\n').replace(/\n$/, '');
            const isBlock = Boolean(match) || rawCode.includes('\n');

            if (!isBlock) {
              return (
                <code
                  className="px-1.5 py-0.5 text-[13px] font-mono rounded bg-zinc-100 dark:bg-white/[0.07] text-zinc-800 dark:text-zinc-200 border border-zinc-200/80 dark:border-white/[0.08]"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            const lang = (match?.[1] || 'text').toLowerCase();
            const isArtifactSized = rawCode.trim().length >= 24;
            const blockIndex = isArtifactSized ? codeBlockCounter++ : -1;
            const blockKey = isArtifactSized
              ? `${messageId}_art_${blockIndex}`
              : `${messageId}_inline_${rawCode.length}_${lang}`;
            const previewable = isPreviewableLanguage(lang);
            const lineCount = rawCode.split('\n').length;
            const title = deriveBlockTitle(lang, rawCode, Math.max(0, blockIndex));

            const artifactPayload: CodeArtifact = {
              id: blockKey,
              title,
              language: lang,
              code: rawCode,
              previewable,
            };

            if (lang === 'mermaid') {
              return (
                <MermaidDiagramBlock
                  code={rawCode}
                  onOpenPreview={() => onOpenArtifact(artifactPayload)}
                />
              );
            }

            return (
              <div className="my-4 rounded-xl border border-zinc-200/90 dark:border-white/[0.08] overflow-hidden bg-[#09090B] text-zinc-100">
                <div className="flex items-center justify-between gap-3 px-3.5 py-2 bg-[#111114] border-b border-white/[0.07] text-xs text-zinc-300">
                  <div className="flex items-center gap-2 font-mono truncate">
                    <span className="font-medium text-zinc-200">{lang}</span>
                    <span aria-hidden="true" className="text-zinc-600">
                      ·
                    </span>
                    <span className="tabular-nums text-zinc-400">
                      {lineCount} {lineCount === 1 ? 'line' : 'lines'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isArtifactSized && (
                      <button
                        type="button"
                        onClick={() => onOpenArtifact(artifactPayload)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#0D9488] hover:bg-[#0F766E] text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {previewable ? (
                          <>
                            <Play className="w-3 h-3" />
                            Preview
                          </>
                        ) : (
                          <>
                            <Code2 className="w-3 h-3" />
                            Inspect
                          </>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDownload(rawCode, lang)}
                      title="Download file"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Save</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(rawCode, blockKey)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copiedKey === blockKey ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-zinc-100 m-0">
                  <code>{rawCode}</code>
                </pre>
              </div>
            );
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
