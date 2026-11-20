import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowUp,
  Check,
  Code2,
  Copy,
  Download,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  Menu,
  MessageSquare,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Square,
  Terminal,
  Upload,
  Video,
  X,
} from 'lucide-react';
import type {
  Attachment,
  ChatMessage,
  CodeArtifact,
  Conversation,
  GeneratedImageItem,
  GeneratedVideoItem,
  GroundingSource,
  ImageAspectRatio,
  ImageStylePreset,
  ThinkingDepth,
  VideoAspectRatio,
  WorkspaceMode,
} from './types';
import {
  extractArtifactsFromMarkdown,
  formatBytes,
  processUploadedFile,
  tryClientRasterRescue,
  tryClientVideoRescue,
} from './utils/fileProcessing';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { ArtifactPanel } from './components/ArtifactPanel';
import { Sidebar } from './components/Sidebar';

const STORAGE_KEY_CONVS = 'kestrel_ai_conversations_v1';
const STORAGE_KEY_THEME = 'kestrel_ai_theme_v1';

function createEmptyConversation(mode: WorkspaceMode = 'chat'): Conversation {
  return {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: 'New session',
    mode,
    messages: [],
    updatedAt: Date.now(),
  };
}

function loadSavedConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONVS);
    if (!raw) return [createEmptyConversation('chat')];
    const parsed = JSON.parse(raw) as Array<
      Omit<Conversation, 'mode'> & { mode?: string }
    >;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [createEmptyConversation('chat')];
    }
    return parsed.map((c) => ({
      ...c,
      mode: c.mode === 'code' ? 'code' : 'chat',
    }));
  } catch {
    return [createEmptyConversation('chat')];
  }
}

function persistConversationsSafely(convs: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY_CONVS, JSON.stringify(convs));
  } catch {
    try {
      const trimmed = convs.slice(0, 20).map((c) => ({
        ...c,
        messages: c.messages.map((m) => ({
          ...m,
          generatedVideo: m.generatedVideo
            ? {
                ...m.generatedVideo,
                dataUrl: m.generatedVideo.posterDataUrl || '',
              }
            : undefined,
          attachments: m.attachments?.map((a) => ({
            ...a,
            base64: undefined,
            previewUrl: a.kind === 'image' ? undefined : a.previewUrl,
            extractedText: a.extractedText?.slice(0, 4000),
          })),
        })),
      }));
      localStorage.setItem(STORAGE_KEY_CONVS, JSON.stringify(trimmed));
    } catch {
      // Ignore if storage unavailable
    }
  }
}

function replaceArtifactCodeInMarkdown(
  markdown: string,
  targetIndex: number,
  newCode: string
): string {
  const regex = /```([a-zA-Z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  let idx = 0;
  return markdown.replace(regex, (full, lang: string, body: string) => {
    const normalizedBody = body.replace(/\r\n/g, '\n');
    if (!normalizedBody.trim() || normalizedBody.trim().length < 24) return full;
    const currentIdx = idx++;
    if (currentIdx !== targetIndex) return full;
    const cleanCode = newCode.replace(/\r\n/g, '\n').replace(/\n$/, '');
    return `\`\`\`${lang}\n${cleanCode}\n\`\`\``;
  });
}

function extractImagePrompt(
  rawText: string,
  hasAttachments: boolean,
  mode: WorkspaceMode
): string | null {
  const text = rawText.trim();
  if (!text) return null;

  const slashMatch = text.match(/^\/(?:image|pic|img|draw)\s+([\s\S]+)/i);
  if (slashMatch?.[1]?.trim()) {
    return slashMatch[1].trim();
  }

  if (hasAttachments) return null;

  if (
    mode === 'code' &&
    /\b(?:react|html|css|tailwind|component|app|script|code|python|typescript|javascript|svg)\b/i.test(
      text
    )
  ) {
    return null;
  }

  const naturalMatch = text.match(
    /^(?:(?:please|can you|could you|hey|hi|plz)\s+)*(?:make|generate|create|draw|paint|sketch|render|design)\s+(?:me\s+|us\s+)?(?:a|an|some)?\s*(?:cool|nice|realistic|cute|cinematic|epic|minimalist|detailed)?\s*(?:pic|pics|picture|pictures|image|images|photo|photograph|illustration|drawing|painting|artwork|wallpaper|portrait|sketch)\s*(?:of|for|about|showing|with)?\s*([\s\S]+)/i
  );
  if (naturalMatch?.[1]?.trim()) {
    return naturalMatch[1].trim();
  }

  const directDrawMatch = text.match(
    /^(?:(?:please|can you|could you)\s+)*(?:draw|paint|sketch)\s+(?:me\s+)?(?:a|an)?\s*([\s\S]+)/i
  );
  if (
    directDrawMatch?.[1]?.trim() &&
    !/\b(?:chart|graph|diagram|architecture|flowchart|ui|wireframe)\b/i.test(text)
  ) {
    return directDrawMatch[1].trim();
  }

  return null;
}

function extractVideoPrompt(
  rawText: string,
  hasAttachments: boolean,
  mode: WorkspaceMode
): string | null {
  const text = rawText.trim();
  if (!text) return null;

  const slashMatch = text.match(/^\/(?:video|vid|animate|clip|movie)\s+([\s\S]+)/i);
  if (slashMatch?.[1]?.trim()) {
    return slashMatch[1].trim();
  }

  if (hasAttachments) return null;

  if (
    mode === 'code' &&
    /\b(?:react|html|css|tailwind|component|app|script|code|python|typescript|javascript|player|svg)\b/i.test(
      text
    )
  ) {
    return null;
  }

  const naturalMatch = text.match(
    /^(?:(?:please|can you|could you|hey|hi|plz)\s+)*(?:make|generate|create|render|produce|animate)\s+(?:me\s+|us\s+)?(?:a|an|some)?\s*(?:(?:\d+(?:\.\d+)?\s*(?:-?\s*)(?:s|sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours)\s*(?:long\s+)?)|(?:short|long|cool|nice|realistic|cute|cinematic|epic|awesome|3d|hd|4k|animated)\s+)*(?:video|videos|clip|clips|animation|animations|movie|film|reel|motion)\s*(?:of|for|about|showing|with)?\s*([\s\S]+)/i
  );
  if (naturalMatch?.[1]?.trim()) {
    const durBefore = text.match(
      /\b(\d+(?:\.\d+)?\s*(?:-?\s*)(?:s|sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours))\b/i
    );
    const body = naturalMatch[1].trim();
    if (durBefore && !body.includes(durBefore[1])) {
      return `${body} for ${durBefore[1]}`;
    }
    return body;
  }

  const shortDirectMatch = text.match(
    /^(?:a\s+|an\s+|some\s+)?(?:(?:short|long|cool|nice|cinematic|realistic|\d+(?:s|sec|seconds?))\s+)*(?:video|clip|animation|movie|film|reel)\s+(?:of|about|showing|for|with)?\s*([\s\S]+)/i
  );
  if (shortDirectMatch?.[1]?.trim()) {
    return shortDirectMatch[1].trim();
  }

  const colonVideoMatch = text.match(/^video\s*:\s*([\s\S]+)/i);
  if (colonVideoMatch?.[1]?.trim()) {
    return colonVideoMatch[1].trim();
  }

  const trailingVideoMatch = text.match(/^(.{3,}?)\s+(?:video|clip|animation|movie)$/i);
  if (
    trailingVideoMatch?.[1]?.trim() &&
    mode !== 'code' &&
    !/\b(?:react|html|css|component|player|code|script|python|typescript|javascript)\b/i.test(text)
  ) {
    return trailingVideoMatch[1].trim();
  }

  const directAnimateMatch = text.match(
    /^(?:(?:please|can you|could you)\s+)*animate\s+(?:me\s+)?(?:a|an)?\s*([\s\S]+)/i
  );
  if (
    directAnimateMatch?.[1]?.trim() &&
    !/\b(?:chart|graph|diagram|component|ui|button|menu|card|div|svg)\b/i.test(text)
  ) {
    return directAnimateMatch[1].trim();
  }

  return null;
}

interface StarterCard {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
  icon: 'chat' | 'image' | 'video' | 'file' | 'code' | 'terminal' | 'layers';
}

const STARTER_PROMPTS: Record<WorkspaceMode, StarterCard[]> = {
  chat: [
    {
      id: 'explain',
      title: 'Technical breakdown',
      subtitle: 'Compare HTTP/3 and QUIC against TCP+TLS clearly',
      prompt:
        'Explain how HTTP/3 and QUIC improve web latency compared to TCP+TLS, with a concise comparison table.',
      icon: 'chat',
    },
    {
      id: 'image',
      title: 'High-res image generation',
      subtitle: 'Alpine cabin under northern lights on a mirror lake',
      prompt:
        '/image A serene Japanese mountain cabin under glowing aurora borealis reflected in a calm alpine lake',
      icon: 'image',
    },
    {
      id: 'video',
      title: '15s animated cinema video',
      subtitle: 'Bioluminescent ocean waves rolling onto dark basalt',
      prompt:
        '/video Golden bioluminescent ocean waves rolling onto a dark volcanic beach at night',
      icon: 'video',
    },
    {
      id: 'file',
      title: 'Document & vision analysis',
      subtitle: 'Upload PDF, DOCX, CSV, source code, or photos',
      prompt:
        'I will attach a PDF, DOCX, CSV, code file, or image—tell me what insights you can extract from it.',
      icon: 'file',
    },
  ],
  code: [
    {
      id: 'dashboard',
      title: 'Interactive React Dashboard',
      subtitle: 'Expense tracker with filters, form & live charts',
      prompt:
        'Build a self-contained React component (jsx) for a personal expense & cashflow tracker with category filters, add-entry form, and SVG bar chart.',
      icon: 'code',
    },
    {
      id: 'physics',
      title: 'HTML5 Canvas Orbital Sim',
      subtitle: 'Interactive N-body gravity playground with sliders',
      prompt:
        'Create a single-file HTML5 Canvas gravity & orbital mechanics simulator with interactive sliders for mass, trail length, and pause/reset.',
      icon: 'layers',
    },
    {
      id: 'diagram',
      title: 'System Architecture SVG',
      subtitle: 'Clean vector diagram for client, gateway & router',
      prompt:
        'Generate a crisp technical SVG system architecture diagram showing a client browser, Express API gateway, intelligent model router, and distributed compute nodes.',
      icon: 'layers',
    },
    {
      id: 'python',
      title: 'Production Python CLI',
      subtitle: 'Typed CSV validator, normalizer & deduplicator',
      prompt:
        'Write a well-typed Python CLI script that validates, normalizes, and deduplicates messy CSV files with summary statistics.',
      icon: 'terminal',
    },
  ],
};

function StarterIcon({ icon }: { icon: StarterCard['icon'] }) {
  const cls = 'w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0';
  switch (icon) {
    case 'image':
      return <ImageIcon className={cls} />;
    case 'video':
      return <Video className={cls} />;
    case 'file':
      return <FileText className={cls} />;
    case 'code':
      return <Code2 className={cls} />;
    case 'terminal':
      return <Terminal className={cls} />;
    case 'layers':
      return <Layers className={cls} />;
    default:
      return <MessageSquare className={cls} />;
  }
}

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_THEME);
      if (saved === 'light') return false;
    } catch {
      // ignore
    }
    return true;
  });

  const [conversations, setConversations] = useState<Conversation[]>(loadSavedConversations);
  const [activeId, setActiveId] = useState<string>(() => conversations[0]?.id || '');
  const [mode, setMode] = useState<WorkspaceMode>(() =>
    conversations[0]?.mode === 'code' ? 'code' : 'chat'
  );

  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [thinkingDepth, setThinkingDepth] = useState<ThinkingDepth>(() =>
    conversations[0]?.mode === 'code' ? 'XHIGH' : 'HIGH'
  );
  const [useWebSearch, setUseWebSearch] = useState(false);

  // Contextual media composer options
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [imageStyle, setImageStyle] = useState<ImageStylePreset>('photorealistic');
  const [videoDuration, setVideoDuration] = useState<5 | 10 | 15>(15);
  const [videoAspectRatio, setVideoAspectRatio] = useState<VideoAspectRatio>('16:9');

  const [isStreaming, setIsStreaming] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);
  const [sidebarCollapsedDesktop, setSidebarCollapsedDesktop] = useState(false);

  const [activeArtifact, setActiveArtifact] = useState<CodeArtifact | null>(null);
  const [inspectedAttachment, setInspectedAttachment] = useState<Attachment | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const plusMenuRef = useRef<HTMLDivElement | null>(null);

  const isImageDraft = /^\s*\/(?:image|pic|img|draw)\s/i.test(input);
  const isVideoDraft = /^\s*\/(?:video|vid|animate|clip|movie)\s/i.test(input);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setPlusMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlusMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [input]);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_KEY_THEME, darkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [darkMode]);

  useEffect(() => {
    persistConversationsSafely(conversations);
  }, [conversations]);

  const activeConversation = useMemo(() => {
    return conversations.find((c) => c.id === activeId) || conversations[0];
  }, [conversations, activeId]);

  const allSessionArtifacts = useMemo(() => {
    if (!activeConversation) return [];
    const list: CodeArtifact[] = [];
    for (const msg of activeConversation.messages) {
      if (msg.role === 'assistant') {
        list.push(...extractArtifactsFromMarkdown(msg.content, msg.id));
      }
    }
    return list;
  }, [activeConversation]);

  // Keep activeArtifact synced if its code updates
  useEffect(() => {
    if (!activeArtifact) return;
    const updated = allSessionArtifacts.find((a) => a.id === activeArtifact.id);
    if (updated && updated.code !== activeArtifact.code) {
      setActiveArtifact(updated);
    }
  }, [allSessionArtifacts, activeArtifact]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages.length, isStreaming]);

  const handleModeSwitch = (nextMode: WorkspaceMode) => {
    setMode(nextMode);
    setThinkingDepth(nextMode === 'code' ? 'XHIGH' : 'HIGH');
    if (activeConversation && activeConversation.messages.length === 0) {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversation.id ? { ...c, mode: nextMode } : c))
      );
    }
  };

  const handleNewSession = (targetMode?: WorkspaceMode) => {
    if (isStreaming) {
      abortRef.current?.abort();
      setIsStreaming(false);
      setStatusLabel(null);
    }
    const chosenMode = targetMode || mode;
    const created = createEmptyConversation(chosenMode);
    setConversations((prev) => [created, ...prev]);
    setActiveId(created.id);
    setMode(chosenMode);
    setThinkingDepth(chosenMode === 'code' ? 'XHIGH' : 'HIGH');
    setActiveArtifact(null);
    setPendingAttachments([]);
    setInput('');
  };

  const handleSelectConversation = (id: string) => {
    if (isStreaming) {
      abortRef.current?.abort();
      setIsStreaming(false);
      setStatusLabel(null);
    }
    const target = conversations.find((c) => c.id === id);
    if (!target) return;
    const nextMode = target.mode === 'code' ? 'code' : 'chat';
    setActiveId(id);
    setMode(nextMode);
    setThinkingDepth(nextMode === 'code' ? 'XHIGH' : 'HIGH');
    setActiveArtifact(null);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length === 0) {
        const fresh = createEmptyConversation('chat');
        setActiveId(fresh.id);
        setMode('chat');
        return [fresh];
      }
      if (id === activeId) {
        setActiveId(next[0].id);
        setMode(next[0].mode === 'code' ? 'code' : 'chat');
      }
      return next;
    });
  };

  const handleClearAll = () => {
    const fresh = createEmptyConversation('chat');
    setConversations([fresh]);
    setActiveId(fresh.id);
    setMode('chat');
    setActiveArtifact(null);
  };

  const ingestFiles = async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;
    setUploadNotice(`Processing ${fileArr.length} file${fileArr.length > 1 ? 's' : ''}...`);
    const processed: Attachment[] = [];
    for (const file of fileArr.slice(0, 6)) {
      try {
        const att = await processUploadedFile(file);
        processed.push(att);
      } catch {
        setUploadNotice(`Skipped ${file.name} (unsupported format).`);
      }
    }
    if (processed.length > 0) {
      setPendingAttachments((prev) => [...prev, ...processed]);
      setUploadNotice(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) pastedFiles.push(f);
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault();
      void ingestFiles(pastedFiles);
    }
  };

  const updateConversationMessages = (
    convId: string,
    updater: (msgs: ChatMessage[]) => ChatMessage[],
    newTitle?: string
  ) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              title: newTitle ?? c.title,
              mode,
              messages: updater(c.messages),
              updatedAt: Date.now(),
            }
          : c
      )
    );
  };

  const handleUpdateArtifactCode = (artifactId: string, newCode: string) => {
    const match = artifactId.match(/^(.+)_art_(\d+)$/);
    if (!match || !activeConversation) return;
    const [, msgId, idxStr] = match;
    const blockIdx = Number(idxStr);

    updateConversationMessages(activeConversation.id, (msgs) =>
      msgs.map((m) =>
        m.id === msgId
          ? {
              ...m,
              content: replaceArtifactCodeInMarkdown(m.content, blockIdx, newCode),
            }
          : m
      )
    );
    setActiveArtifact((prev) =>
      prev && prev.id === artifactId ? { ...prev, code: newCode } : prev
    );
  };

  const handleInlineImageCommand = async (
    convId: string,
    promptText: string,
    assistantMsgId: string
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setStatusLabel('Generating high-resolution image...');
    try {
      let rawImgItem: GeneratedImageItem;
      try {
        const resp = await fetch('/api/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
            aspectRatio: imageAspectRatio,
            style: imageStyle,
            enhancePrompt: true,
          }),
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error('image_rescue');
        rawImgItem = (await resp.json()) as GeneratedImageItem;
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        const sizeMap: Record<ImageAspectRatio, { w: number; h: number }> = {
          '1:1': { w: 1024, h: 1024 },
          '16:9': { w: 1344, h: 768 },
          '9:16': { w: 768, h: 1344 },
          '4:3': { w: 1152, h: 896 },
          '3:4': { w: 896, h: 1152 },
        };
        const dims = sizeMap[imageAspectRatio] || { w: 1024, h: 1024 };
        rawImgItem = {
          id: `img_${Date.now()}`,
          prompt: promptText,
          aspectRatio: imageAspectRatio,
          style: imageStyle,
          dataUrl: '',
          mimeType: 'image/jpeg',
          engine: 'Kestrel Vision Studio',
          fallbackPath: [],
          clientHfFallback: {
            prompt: promptText,
            width: dims.w,
            height: dims.h,
            aspectRatio: imageAspectRatio,
          },
          createdAt: Date.now(),
        };
      }

      if (controller.signal.aborted) return;
      const imgItem = await tryClientRasterRescue(rawImgItem);
      if (controller.signal.aborted) return;

      updateConversationMessages(convId, (msgs) =>
        msgs.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: imgItem.enhancedPrompt
                  ? `Generated image for: **${imgItem.prompt}**\n\n*Prompt direction:* ${imgItem.enhancedPrompt}`
                  : `Generated image for: **${imgItem.prompt}**`,
                generatedImage: imgItem,
                engineUsed: imgItem.engine,
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      setStatusLabel(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const handleInlineVideoCommand = async (
    convId: string,
    promptText: string,
    assistantMsgId: string
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setStatusLabel(`Directing ${videoDuration}s video...`);
    try {
      let rawVidItem: GeneratedVideoItem;
      try {
        const resp = await fetch('/api/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: promptText,
            durationSec: videoDuration,
            aspectRatio: videoAspectRatio,
            enhancePrompt: true,
          }),
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error('video_rescue');
        rawVidItem = (await resp.json()) as GeneratedVideoItem;
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        rawVidItem = {
          id: `vid_${Date.now()}`,
          prompt: promptText,
          aspectRatio: videoAspectRatio,
          dataUrl: '',
          mimeType: 'video/webm',
          engine: 'Kestrel Cinema Engine',
          fallbackPath: [],
          durationSec: videoDuration,
          clientHfVideoFallback: {
            prompt: promptText,
            durationSec: videoDuration,
            aspectRatio: videoAspectRatio,
          },
          motionScript: {
            camera: 'zoom-in',
            atmosphere: 'none',
            moodColors: ['#090D16', '#1E3A8A', '#3B82F6'],
            durationSec: videoDuration,
          },
          createdAt: Date.now(),
        };
      }

      if (controller.signal.aborted) return;
      setStatusLabel(`Synthesizing ${rawVidItem.durationSec || videoDuration}s motion video...`);
      const vidItem = await tryClientVideoRescue(rawVidItem, {
        signal: controller.signal,
        onProgress: (stage) => {
          if (!controller.signal.aborted) setStatusLabel(stage);
        },
      });
      if (controller.signal.aborted) return;

      const sec = vidItem.durationSec || videoDuration;
      const noticePrefix = vidItem.durationNotice ? `${vidItem.durationNotice}\n\n` : '';
      const summaryLine = vidItem.enhancedPrompt
        ? `${noticePrefix}Generated **${sec}s** animated video for: **${vidItem.prompt}**\n\n*Scene direction:* ${vidItem.enhancedPrompt}`
        : `${noticePrefix}Generated **${sec}s** animated video for: **${vidItem.prompt}**`;

      updateConversationMessages(convId, (msgs) =>
        msgs.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                content: summaryLine,
                generatedVideo: vidItem,
                engineUsed: vidItem.engine,
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      setStatusLabel(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const sendMessage = async (
    overrideText?: string,
    overrideAttachments?: Attachment[]
  ) => {
    if (!activeConversation || isStreaming) return;
    const text = (overrideText ?? input).trim();
    const attachmentsToSend = overrideAttachments ?? pendingAttachments;

    if (!text && attachmentsToSend.length === 0) return;

    const videoPrompt = extractVideoPrompt(
      text,
      attachmentsToSend.length > 0,
      mode
    );
    const imagePrompt = videoPrompt
      ? null
      : extractImagePrompt(text, attachmentsToSend.length > 0, mode);

    const convId = activeConversation.id;
    const isFirstMessage = activeConversation.messages.length === 0;
    const derivedTitle = isFirstMessage
      ? (text || attachmentsToSend[0]?.name || 'New session').slice(0, 46)
      : undefined;

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}_u`,
      role: 'user',
      content: text,
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      createdAt: Date.now(),
    };

    const assistantMsgId = `msg_${Date.now()}_a`;
    const placeholderAssistant: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      isImageRequest: Boolean(imagePrompt),
      isVideoRequest: Boolean(videoPrompt),
      createdAt: Date.now(),
    };

    const historyForApi = [...activeConversation.messages, userMsg];

    updateConversationMessages(
      convId,
      (msgs) => [...msgs, userMsg, placeholderAssistant],
      derivedTitle
    );

    if (!overrideText) setInput('');
    if (!overrideAttachments) setPendingAttachments([]);
    setIsStreaming(true);
    setStatusLabel(
      mode === 'code' || thinkingDepth === 'XHIGH'
        ? 'Reasoning deeply...'
        : 'Thinking...'
    );

    if (videoPrompt) {
      await handleInlineVideoCommand(convId, videoPrompt, assistantMsgId);
      return;
    }

    if (imagePrompt) {
      await handleInlineImageCommand(convId, imagePrompt, assistantMsgId);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = '';

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          thinkingLevel: thinkingDepth,
          useWebSearch,
          messages: (() => {
            const binaryIndices: number[] = [];
            historyForApi.forEach((m, i) => {
              if (m.attachments?.some((a) => Boolean(a.base64))) binaryIndices.push(i);
            });
            const keepBinarySet = new Set(binaryIndices.slice(-2));
            return historyForApi.map((m, i) => ({
              role: m.role,
              content: m.content,
              attachments: m.attachments?.map((a) => ({
                id: a.id,
                name: a.name,
                mimeType: a.mimeType,
                size: a.size,
                kind: a.kind,
                base64: keepBinarySet.has(i) ? a.base64 : undefined,
                extractedText: a.extractedText,
                dimensions: a.dimensions,
              })),
            }));
          })(),
        }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        throw new Error('Response interrupted');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const evt = JSON.parse(jsonStr) as {
              type: string;
              text?: string;
              stage?: string;
              engineUsed?: string;
              groundingSources?: GroundingSource[];
            };

            if (evt.type === 'status' && evt.stage && !accumulated) {
              setStatusLabel(evt.stage);
            } else if (evt.type === 'delta' && evt.text) {
              accumulated += evt.text;
              const snapshot = accumulated;
              updateConversationMessages(convId, (msgs) =>
                msgs.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: snapshot } : m
                )
              );
            } else if (evt.type === 'meta') {
              updateConversationMessages(convId, (msgs) =>
                msgs.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        engineUsed: evt.engineUsed,
                        groundingSources: evt.groundingSources,
                      }
                    : m
                )
              );
            } else if (evt.type === 'error' && !accumulated) {
              accumulated = 'Ready whenever you would like to continue — click **Regenerate** to refine.';
              updateConversationMessages(convId, (msgs) =>
                msgs.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: accumulated } : m
                )
              );
            }
          } catch {
            // Skip malformed SSE line
          }
        }
      }

      if (accumulated) {
        const artifacts = extractArtifactsFromMarkdown(accumulated, assistantMsgId);
        const firstPreviewable = artifacts.find((a) => a.previewable);
        if (firstPreviewable) {
          setActiveArtifact(firstPreviewable);
        } else if (mode === 'code' && artifacts[0]) {
          setActiveArtifact(artifacts[0]);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        updateConversationMessages(convId, (msgs) =>
          msgs.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content:
                    accumulated ||
                    'Click **Regenerate** to resend this request.',
                }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      setStatusLabel(null);
      abortRef.current = null;
    }
  };

  const handleRegenerate = (assistantMsgId: string) => {
    if (!activeConversation || isStreaming) return;
    const idx = activeConversation.messages.findIndex((m) => m.id === assistantMsgId);
    if (idx <= 0) return;
    const prevUserMsg = [...activeConversation.messages.slice(0, idx)]
      .reverse()
      .find((m) => m.role === 'user');
    if (!prevUserMsg) return;

    const trimmedHistory = activeConversation.messages.slice(0, idx - 1);
    const keptMsgIds = new Set(trimmedHistory.map((m) => m.id));
    if (activeArtifact) {
      const artMsgId = activeArtifact.id.replace(/_art_\d+$/, '');
      if (!keptMsgIds.has(artMsgId)) setActiveArtifact(null);
    }
    updateConversationMessages(activeConversation.id, () => trimmedHistory);
    setTimeout(() => {
      void sendMessage(prevUserMsg.content, prevUserMsg.attachments);
    }, 30);
  };

  const handleEditUserMessage = (userMsg: ChatMessage) => {
    if (!activeConversation || isStreaming) return;
    const idx = activeConversation.messages.findIndex((m) => m.id === userMsg.id);
    if (idx < 0) return;
    const trimmedHistory = activeConversation.messages.slice(0, idx);
    const keptMsgIds = new Set(trimmedHistory.map((m) => m.id));
    if (activeArtifact) {
      const artMsgId = activeArtifact.id.replace(/_art_\d+$/, '');
      if (!keptMsgIds.has(artMsgId)) setActiveArtifact(null);
    }
    updateConversationMessages(activeConversation.id, () => trimmedHistory);
    setInput(userMsg.content);
    if (userMsg.attachments?.length) {
      setPendingAttachments(userMsg.attachments);
    }
    setTimeout(() => textareaRef.current?.focus(), 20);
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedMsgId(msg.id);
      setTimeout(() => setCopiedMsgId(null), 1600);
    } catch {
      // ignore
    }
  };

  const currentStarters = STARTER_PROMPTS[mode];

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#FAFAF9] dark:bg-[#09090B] text-[#18181B] dark:text-[#F4F4F5]"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFiles(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setIsDraggingFiles(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFiles(false);
        if (e.dataTransfer.files?.length) {
          void ingestFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* Main Workspace Area */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <Sidebar
          conversations={conversations}
          activeId={activeConversation?.id || ''}
          mode={mode}
          darkMode={darkMode}
          isOpenMobile={sidebarOpenMobile}
          isCollapsedDesktop={sidebarCollapsedDesktop}
          onCloseMobile={() => setSidebarOpenMobile(false)}
          onToggleCollapseDesktop={() => setSidebarCollapsedDesktop(true)}
          onModeChange={handleModeSwitch}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onSelect={handleSelectConversation}
          onNewSession={handleNewSession}
          onDelete={handleDeleteConversation}
          onClearAll={handleClearAll}
        />

        <main className="flex-1 min-w-0 flex flex-col h-full relative bg-[#FAFAF9] dark:bg-[#09090B]">
          {/* Subtle top studio sheen */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-64 hidden dark:block"
            style={{
              background:
                'radial-gradient(ellipse 70% 55% at 50% -20%, rgba(45, 212, 191, 0.06), transparent)',
            }}
          />

          {/* Clean Architectural Header */}
          <header className="h-13 shrink-0 px-4 sm:px-6 border-b border-zinc-200/80 dark:border-white/[0.07] bg-white/85 dark:bg-[#09090B]/85 backdrop-blur-md flex items-center justify-between gap-3 z-20">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpenMobile(true)}
                aria-label="Open menu"
                className="lg:hidden p-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] cursor-pointer shrink-0"
              >
                <Menu className="w-5 h-5" />
              </button>

              {sidebarCollapsedDesktop && (
                <button
                  type="button"
                  onClick={() => setSidebarCollapsedDesktop(false)}
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                  className="hidden lg:inline-flex p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </button>
              )}

              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {activeConversation?.title || 'New session'}
              </span>
              <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-700 text-xs shrink-0">
                /
              </span>
              <span className="text-[12px] font-mono text-zinc-500 dark:text-zinc-400 shrink-0 whitespace-nowrap">
                {mode === 'code' ? 'Code Studio' : 'Workspace'}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {allSessionArtifacts.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeArtifact) {
                      setActiveArtifact(null);
                    } else {
                      setActiveArtifact(
                        allSessionArtifacts[allSessionArtifacts.length - 1]
                      );
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    activeArtifact
                      ? 'bg-[#0D9488]/12 border-[#0D9488]/40 text-[#0D9488] dark:text-[#2DD4BF]'
                      : 'border-zinc-200 dark:border-white/[0.1] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  Artifacts ({allSessionArtifacts.length})
                </button>
              )}

              <button
                type="button"
                onClick={() => handleNewSession()}
                title="New session"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-white/[0.1] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.05] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          </header>

          {/* Messages Viewport */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-8 py-6 relative z-10 min-w-0">
            <div className="max-w-3xl mx-auto min-w-0">
              {!activeConversation || activeConversation.messages.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="min-h-[58vh] flex flex-col justify-center py-8 space-y-8"
                >
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#0D9488] dark:text-[#2DD4BF]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0D9488] dark:bg-[#2DD4BF]" />
                      <span>{mode === 'code' ? 'Engineering & Live Workbench' : 'Multi-Modal Studio'}</span>
                    </div>
                    <h1 className="font-display text-3xl sm:text-[36px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 text-balance leading-[1.15]">
                      {mode === 'code'
                        ? 'Build, compile, and launch.'
                        : 'Think, create, and direct.'}
                    </h1>
                    <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 max-w-xl">
                      {mode === 'code'
                        ? 'Architect React, TypeScript, Python, C/C++, Bash, SQL, and full-stack HTML+CSS builds with automatic live execution and self-correcting preview.'
                        : 'Synthesize high-resolution photography, direct cinema motion videos, analyze uploaded files, and research with live web grounding.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentStarters.map((starter) => (
                      <button
                        key={starter.id}
                        type="button"
                        onClick={() => {
                          setInput(starter.prompt);
                          textareaRef.current?.focus();
                        }}
                        className="group text-left p-4 rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-[#111114] hover:border-[#0D9488]/60 dark:hover:border-[#2DD4BF]/50 hover:bg-zinc-50/70 dark:hover:bg-[#16161B] transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <StarterIcon icon={starter.icon} />
                          <span className="text-[13.5px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {starter.title}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                          {starter.subtitle}
                        </p>
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-8 pb-6">
                  {activeConversation.messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                        className={isUser ? 'group flex flex-col items-end gap-1.5' : 'space-y-2.5'}
                      >
                        {isUser ? (
                          <>
                            <div className="max-w-[85%] space-y-2.5 rounded-2xl bg-zinc-900 text-zinc-50 dark:bg-[#18181D] dark:text-zinc-100 border border-transparent dark:border-white/[0.09] px-4 py-3">
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {msg.attachments.map((att) =>
                                    att.kind === 'image' && att.previewUrl ? (
                                      <button
                                        key={att.id}
                                        type="button"
                                        onClick={() => setInspectedAttachment(att)}
                                        className="block rounded-lg overflow-hidden border border-white/15 hover:opacity-90 transition-opacity cursor-pointer"
                                      >
                                        <img
                                          src={att.previewUrl}
                                          alt={att.name}
                                          className="max-h-48 object-cover"
                                        />
                                      </button>
                                    ) : (
                                      <button
                                        key={att.id}
                                        type="button"
                                        onClick={() => setInspectedAttachment(att)}
                                        className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-left cursor-pointer"
                                      >
                                        <FileText className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate max-w-[180px]">
                                          {att.name}
                                        </span>
                                        <span className="text-white/60 tabular-nums">
                                          {formatBytes(att.size)}
                                        </span>
                                      </button>
                                    )
                                  )}
                                </div>
                              )}
                              {msg.content && (
                                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                                  {msg.content}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-3 px-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity text-[11px] text-zinc-400 dark:text-zinc-500">
                              <button
                                type="button"
                                onClick={() => handleCopyMessage(msg)}
                                className="inline-flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                                {copiedMsgId === msg.id ? 'Copied' : 'Copy'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditUserMessage(msg)}
                                disabled={isStreaming}
                                className="inline-flex items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300 disabled:opacity-40 cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                Edit
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-3 min-w-0">
                            {msg.content ? (
                              <MarkdownRenderer
                                content={msg.content}
                                messageId={msg.id}
                                onOpenArtifact={(art) => setActiveArtifact(art)}
                              />
                            ) : (
                              <div className="py-2 text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0D9488] dark:text-[#2DD4BF]" />
                                <span>
                                  {statusLabel ||
                                    (msg.isVideoRequest
                                      ? `Generating ${videoDuration}s video...`
                                      : msg.isImageRequest
                                        ? 'Creating image...'
                                        : 'Thinking...')}
                                </span>
                              </div>
                            )}

                            {msg.generatedImage && Boolean(msg.generatedImage.dataUrl) && (
                              <div className="rounded-xl border border-zinc-200 dark:border-white/[0.09] bg-white dark:bg-[#111114] overflow-hidden max-w-md shadow-xs dark:shadow-none">
                                <img
                                  src={msg.generatedImage.dataUrl}
                                  alt={msg.generatedImage.prompt}
                                  referrerPolicy="no-referrer"
                                  className="w-full max-h-[380px] object-contain bg-zinc-100 dark:bg-[#09090B]"
                                />
                                <div className="px-3.5 py-2.5 border-t border-zinc-200 dark:border-white/[0.07] flex items-center justify-between gap-2 text-xs">
                                  <span className="text-zinc-500 dark:text-zinc-400 truncate tabular-nums font-mono">
                                    {msg.generatedImage.aspectRatio}
                                  </span>
                                  <a
                                    href={msg.generatedImage.dataUrl}
                                    download={`kestrel-pic-${msg.generatedImage.id.slice(-5)}.${
                                      msg.generatedImage.mimeType.includes('svg')
                                        ? 'svg'
                                        : msg.generatedImage.mimeType.includes('webp')
                                          ? 'webp'
                                          : msg.generatedImage.mimeType.includes('png')
                                            ? 'png'
                                            : 'jpg'
                                    }`}
                                    className="inline-flex items-center gap-1 font-medium text-[#0D9488] dark:text-[#2DD4BF] hover:underline shrink-0"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Save
                                  </a>
                                </div>
                              </div>
                            )}

                            {msg.generatedVideo && Boolean(msg.generatedVideo.dataUrl || msg.generatedVideo.posterDataUrl) && (
                              <div className="rounded-xl border border-zinc-200 dark:border-white/[0.09] bg-white dark:bg-[#111114] overflow-hidden max-w-lg shadow-xs dark:shadow-none">
                                {msg.generatedVideo.mimeType.startsWith('video/') && Boolean(msg.generatedVideo.dataUrl) ? (
                                  <video
                                    src={msg.generatedVideo.dataUrl}
                                    poster={msg.generatedVideo.posterDataUrl}
                                    controls
                                    autoPlay
                                    loop
                                    muted
                                    playsInline
                                    className="w-full max-h-[380px] bg-black"
                                  />
                                ) : (
                                  <img
                                    src={
                                      msg.generatedVideo.posterDataUrl ||
                                      msg.generatedVideo.dataUrl
                                    }
                                    alt={msg.generatedVideo.prompt}
                                    className="w-full max-h-[380px] object-contain bg-zinc-100 dark:bg-[#09090B]"
                                  />
                                )}
                                <div className="px-3.5 py-2.5 border-t border-zinc-200 dark:border-white/[0.07] flex items-center justify-between gap-2 text-xs">
                                  <span className="text-zinc-500 dark:text-zinc-400 truncate tabular-nums font-mono">
                                    {msg.generatedVideo.durationSec || 15}s
                                    {msg.generatedVideo.aspectRatio
                                      ? ` · ${msg.generatedVideo.aspectRatio}`
                                      : ''}
                                  </span>
                                  <a
                                    href={msg.generatedVideo.dataUrl || msg.generatedVideo.posterDataUrl}
                                    download={`kestrel-video-${msg.generatedVideo.id.slice(-5)}.${
                                      msg.generatedVideo.mimeType.includes('mp4') && Boolean(msg.generatedVideo.dataUrl)
                                        ? 'mp4'
                                        : msg.generatedVideo.mimeType.includes('webm') && Boolean(msg.generatedVideo.dataUrl)
                                          ? 'webm'
                                          : msg.generatedVideo.mimeType.includes('png')
                                            ? 'png'
                                            : msg.generatedVideo.mimeType.includes('webp')
                                              ? 'webp'
                                              : 'jpg'
                                    }`}
                                    className="inline-flex items-center gap-1 font-medium text-[#0D9488] dark:text-[#2DD4BF] hover:underline shrink-0"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Save
                                  </a>
                                </div>
                              </div>
                            )}

                            {msg.groundingSources &&
                              msg.groundingSources.length > 0 && (
                                <div className="pt-1 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                                  <div className="font-medium text-zinc-700 dark:text-zinc-300">
                                    Sources
                                  </div>
                                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                                    {msg.groundingSources.map((src) => (
                                      <a
                                        key={src.url}
                                        href={src.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="underline underline-offset-2 hover:text-[#0D9488] dark:hover:text-[#2DD4BF] truncate max-w-[260px]"
                                      >
                                        {src.title}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}

                            {msg.content && (
                              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-zinc-400 dark:text-zinc-500">
                                <button
                                  type="button"
                                  onClick={() => handleCopyMessage(msg)}
                                  className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                                >
                                  {copiedMsgId === msg.id ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                                      Copied
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      Copy
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleRegenerate(msg.id)}
                                  disabled={isStreaming}
                                  className="inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-200 disabled:opacity-40 transition-colors cursor-pointer"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  Regenerate
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Soft fade scrim under composer */}
          <div
            aria-hidden="true"
            className="pointer-events-none h-5 -mt-5 shrink-0 bg-gradient-to-t from-[#FAFAF9] dark:from-[#09090B] to-transparent relative z-20"
          />

          {/* Clean Composer */}
          <div className="shrink-0 px-4 sm:px-8 pb-4 pt-1 bg-[#FAFAF9] dark:bg-[#09090B] relative z-20">
            <div className="max-w-3xl mx-auto">
              {uploadNotice && (
                <div className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
                  {uploadNotice}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.docx,.txt,.md,.csv,.tsv,.json,.js,.jsx,.ts,.tsx,.vue,.py,.html,.css,.sql,.yaml,.yml,.xml,.svg,.tex,.c,.cpp,.h,.hpp,.sh,.rs,.go"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    void ingestFiles(e.target.files);
                    e.target.value = '';
                  }
                }}
              />

              <div className="rounded-2xl border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-[#111114] shadow-xs dark:shadow-[0_14px_40px_-14px_rgba(0,0,0,0.75)] focus-within:border-[#0D9488] dark:focus-within:border-[#2DD4BF]/70 transition-colors">
                {/* Contextual Controls Bar when /image, /video, or Web search is active */}
                {(isImageDraft || isVideoDraft || useWebSearch) && (
                  <div className="px-3.5 pt-2.5 pb-1.5 border-b border-zinc-100 dark:border-white/[0.06] flex flex-wrap items-center gap-2 text-xs">
                    {isImageDraft && (
                      <>
                        <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                          Image
                        </span>
                        <div className="inline-flex items-center rounded-md border border-zinc-200 dark:border-white/[0.08] p-0.5 bg-zinc-50 dark:bg-[#09090B]">
                          {(['1:1', '16:9', '9:16', '4:3', '3:4'] as ImageAspectRatio[]).map(
                            (ar) => (
                              <button
                                key={ar}
                                type="button"
                                onClick={() => setImageAspectRatio(ar)}
                                className={`px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums cursor-pointer transition-colors ${
                                  imageAspectRatio === ar
                                    ? 'bg-white dark:bg-[#222227] text-zinc-900 dark:text-white shadow-2xs'
                                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                                }`}
                              >
                                {ar}
                              </button>
                            )
                          )}
                        </div>

                        <select
                          value={imageStyle}
                          onChange={(e) =>
                            setImageStyle(e.target.value as ImageStylePreset)
                          }
                          aria-label="Image style"
                          className="px-2 py-1 rounded-md border border-zinc-200 dark:border-white/[0.08] bg-zinc-50 dark:bg-[#09090B] text-[11px] text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
                        >
                          <option value="photorealistic">Photorealistic</option>
                          <option value="editorial">Editorial</option>
                          <option value="3d-render">3D Render</option>
                          <option value="concept-art">Concept Art</option>
                          <option value="vector">Vector</option>
                        </select>
                      </>
                    )}

                    {isVideoDraft && (
                      <>
                        <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                          Video
                        </span>
                        <div className="inline-flex items-center rounded-md border border-zinc-200 dark:border-white/[0.08] p-0.5 bg-zinc-50 dark:bg-[#09090B]">
                          {([5, 10, 15] as const).map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => setVideoDuration(sec)}
                              className={`px-2 py-0.5 rounded text-[11px] font-medium tabular-nums cursor-pointer transition-colors ${
                                videoDuration === sec
                                  ? 'bg-white dark:bg-[#222227] text-zinc-900 dark:text-white shadow-2xs'
                                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                              }`}
                            >
                              {sec}s
                            </button>
                          ))}
                        </div>

                        <div className="inline-flex items-center rounded-md border border-zinc-200 dark:border-white/[0.08] p-0.5 bg-zinc-50 dark:bg-[#09090B]">
                          {(['16:9', '9:16', '1:1'] as VideoAspectRatio[]).map((ar) => (
                            <button
                              key={ar}
                              type="button"
                              onClick={() => setVideoAspectRatio(ar)}
                              className={`px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums cursor-pointer transition-colors ${
                                videoAspectRatio === ar
                                  ? 'bg-white dark:bg-[#222227] text-zinc-900 dark:text-white shadow-2xs'
                                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                              }`}
                            >
                              {ar}
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {useWebSearch && !isImageDraft && !isVideoDraft && (
                      <button
                        type="button"
                        onClick={() => setUseWebSearch(false)}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[#0D9488]/35 bg-[#0D9488]/10 text-[#0D9488] dark:text-[#2DD4BF] text-[11px] font-medium cursor-pointer"
                      >
                        <Globe className="w-3 h-3" />
                        Web search active
                        <X className="w-3 h-3 opacity-75" />
                      </button>
                    )}
                  </div>
                )}

                {pendingAttachments.length > 0 && (
                  <div className="px-3.5 pt-3 pb-1 flex flex-wrap gap-2">
                    {pendingAttachments.map((att) => (
                      <div
                        key={att.id}
                        className="inline-flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-lg border border-zinc-200 dark:border-white/[0.09] bg-zinc-50 dark:bg-[#18181B] text-xs"
                      >
                        {att.kind === 'image' && att.previewUrl ? (
                          <img
                            src={att.previewUrl}
                            alt={att.name}
                            className="w-6 h-6 rounded object-cover"
                          />
                        ) : (
                          <FileText className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" />
                        )}
                        <button
                          type="button"
                          onClick={() => setInspectedAttachment(att)}
                          className="max-w-[150px] truncate text-zinc-800 dark:text-zinc-200 hover:underline cursor-pointer"
                        >
                          {att.name}
                        </button>
                        <span className="text-zinc-400 tabular-nums">
                          {formatBytes(att.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setPendingAttachments((prev) =>
                              prev.filter((p) => p.id !== att.id)
                            )
                          }
                          aria-label={`Remove ${att.name}`}
                          className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-2 p-2">
                  {/* Plus (+) Features Menu */}
                  <div ref={plusMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setPlusMenuOpen((v) => !v)}
                      aria-expanded={plusMenuOpen}
                      aria-label="Open tools and options"
                      title="Tools & options"
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-xl transition-colors cursor-pointer ${
                        plusMenuOpen ||
                        useWebSearch ||
                        isImageDraft ||
                        isVideoDraft ||
                        pendingAttachments.length > 0
                          ? 'bg-[#0D9488]/15 text-[#0D9488] dark:text-[#2DD4BF]'
                          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      <Plus
                        className={`w-[18px] h-[18px] transition-transform duration-150 ${
                          plusMenuOpen ? 'rotate-45' : ''
                        }`}
                      />
                    </button>

                    <AnimatePresence>
                      {plusMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute bottom-12 left-0 w-64 rounded-xl border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#141418] shadow-xl dark:shadow-[0_18px_48px_-12px_rgba(0,0,0,0.8)] py-1.5 z-40"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              fileInputRef.current?.click();
                              setPlusMenuOpen(false);
                            }}
                            className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-[13px] text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                          >
                            <span className="inline-flex items-center gap-2.5">
                              <Paperclip className="w-4 h-4 text-zinc-400" />
                              Upload photo or file
                            </span>
                            {pendingAttachments.length > 0 && (
                              <Check className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setInput((cur) => {
                                const cleaned = cur.replace(/^\/(?:image|video)\s*/, '');
                                return cur.startsWith('/image ') ? cleaned : `/image ${cleaned}`;
                              });
                              setPlusMenuOpen(false);
                              textareaRef.current?.focus();
                            }}
                            className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-[13px] text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                          >
                            <span className="inline-flex items-center gap-2.5">
                              <ImageIcon className="w-4 h-4 text-zinc-400" />
                              Make a picture
                            </span>
                            {isImageDraft && (
                              <Check className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setInput((cur) => {
                                const cleaned = cur.replace(/^\/(?:image|video)\s*/, '');
                                return cur.startsWith('/video ') ? cleaned : `/video ${cleaned}`;
                              });
                              setPlusMenuOpen(false);
                              textareaRef.current?.focus();
                            }}
                            className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-[13px] text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                          >
                            <span className="inline-flex items-center gap-2.5">
                              <Video className="w-4 h-4 text-zinc-400" />
                              Make a video ({videoDuration}s)
                            </span>
                            {isVideoDraft && (
                              <Check className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setUseWebSearch((v) => !v);
                              setPlusMenuOpen(false);
                            }}
                            className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-[13px] text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                          >
                            <span className="inline-flex items-center gap-2.5">
                              <Globe className="w-4 h-4 text-zinc-400" />
                              Web search
                            </span>
                            {useWebSearch && (
                              <Check className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" />
                            )}
                          </button>

                          {allSessionArtifacts.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                if (activeArtifact) {
                                  setActiveArtifact(null);
                                } else {
                                  setActiveArtifact(
                                    allSessionArtifacts[
                                      allSessionArtifacts.length - 1
                                    ]
                                  );
                                }
                                setPlusMenuOpen(false);
                              }}
                              className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left text-[13px] text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-2.5">
                                <Code2 className="w-4 h-4 text-zinc-400" />
                                Artifacts ({allSessionArtifacts.length})
                              </span>
                              {activeArtifact && (
                                <Check className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" />
                              )}
                            </button>
                          )}

                          <div className="my-1.5 border-t border-zinc-200 dark:border-white/[0.07]" />

                          <div className="px-3 py-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            Reasoning depth
                          </div>
                          {(
                            [
                              { id: 'LOW', label: 'Fast' },
                              { id: 'MEDIUM', label: 'Balanced' },
                              { id: 'HIGH', label: 'Deep' },
                              { id: 'XHIGH', label: 'Max reasoning' },
                            ] as Array<{ id: ThinkingDepth; label: string }>
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                setThinkingDepth(opt.id);
                                setPlusMenuOpen(false);
                              }}
                              className="w-full px-3 py-1.5 flex items-center justify-between gap-3 text-left text-[13px] text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                              <span>{opt.label}</span>
                              {thinkingDepth === opt.id && (
                                <Check className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0" />
                              )}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Clean Auto-Growing Input */}
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onPaste={handlePaste}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder={
                      mode === 'code'
                        ? 'Describe the app or code to build...'
                        : 'Ask anything, upload files, or create pics & videos...'
                    }
                    className="flex-1 min-h-[36px] max-h-[168px] py-1.5 px-1 bg-transparent text-sm sm:text-[15px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none resize-none leading-6"
                  />

                  {/* Send / Stop */}
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={() => {
                        abortRef.current?.abort();
                        setIsStreaming(false);
                        setStatusLabel(null);
                      }}
                      aria-label="Stop generating"
                      className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity shrink-0 cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void sendMessage()}
                      disabled={!input.trim() && pendingAttachments.length === 0}
                      aria-label="Send message"
                      className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white disabled:opacity-25 disabled:cursor-not-allowed text-white dark:text-zinc-900 transition-colors shrink-0 cursor-pointer"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="hidden sm:flex items-center justify-end mt-1.5 px-1 text-[11px] text-zinc-400 dark:text-zinc-600">
                <span>Enter to send · Shift+Enter for new line</span>
              </div>
            </div>
          </div>

          {isDraggingFiles && (
            <div className="absolute inset-0 z-30 bg-[#0D9488]/10 backdrop-blur-[2px] border-2 border-dashed border-[#0D9488] m-3 rounded-2xl flex items-center justify-center pointer-events-none">
              <div className="px-6 py-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-white/[0.1] text-center">
                <Upload className="w-6 h-6 text-[#0D9488] dark:text-[#2DD4BF] mx-auto mb-2" />
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Drop images or documents to attach
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  PNG, JPG, PDF, DOCX, CSV, JSON, and code files
                </p>
              </div>
            </div>
          )}
        </main>

        {activeArtifact && (
          <ArtifactPanel
            artifact={activeArtifact}
            allArtifacts={allSessionArtifacts}
            onSelectArtifact={setActiveArtifact}
            onUpdateArtifactCode={handleUpdateArtifactCode}
            onClose={() => setActiveArtifact(null)}
            onRequestFix={(fixPrompt) => {
              void sendMessage(fixPrompt);
            }}
          />
        )}
      </div>

      {/* Attachment Inspector Modal */}
      {inspectedAttachment && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[82vh] rounded-2xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-white/[0.1] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 dark:border-white/[0.08] flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                  {inspectedAttachment.name}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {inspectedAttachment.mimeType} · {formatBytes(inspectedAttachment.size)}
                  {inspectedAttachment.dimensions
                    ? ` · ${inspectedAttachment.dimensions.width}×${inspectedAttachment.dimensions.height}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedAttachment(null)}
                aria-label="Close inspector"
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {inspectedAttachment.kind === 'image' &&
              inspectedAttachment.previewUrl ? (
                <img
                  src={inspectedAttachment.previewUrl}
                  alt={inspectedAttachment.name}
                  className="max-w-full max-h-[60vh] mx-auto rounded-lg"
                />
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 leading-relaxed">
                  {inspectedAttachment.extractedText ||
                    'No extracted plain text available for preview.'}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
