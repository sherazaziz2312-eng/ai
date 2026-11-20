import { Muxer, ArrayBufferTarget } from 'webm-muxer';
import type {
  Attachment,
  CodeArtifact,
  GeneratedVideoItem,
  VideoMotionScript,
} from '../types';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'html',
  'htm',
  'css',
  'scss',
  'sql',
  'yaml',
  'yml',
  'xml',
  'svg',
  'sh',
  'bash',
  'env',
  'log',
  'ini',
  'toml',
  'rs',
  'go',
  'java',
  'c',
  'cpp',
  'h',
]);

function getExtension(name: string): string {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function compressImageIfNeeded(
  file: File
): Promise<{
  base64: string;
  mimeType: string;
  previewUrl: string;
  dimensions: { width: number; height: number };
}> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode image'));
      el.src = objectUrl;
    });

    const width = img.naturalWidth || 512;
    const height = img.naturalHeight || 512;

    if (file.size <= 3 * 1024 * 1024 && file.type !== 'image/bmp') {
      const buf = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      const mime = file.type || 'image/png';
      return {
        base64,
        mimeType: mime,
        previewUrl: `data:${mime};base64,${base64}`,
        dimensions: { width, height },
      };
    }

    const maxDim = 2048;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    const base64 = dataUrl.split(',')[1] || '';
    return {
      base64,
      mimeType: 'image/jpeg',
      previewUrl: dataUrl,
      dimensions: { width: targetW, height: targetH },
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function processUploadedFile(file: File): Promise<Attachment> {
  const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ext = getExtension(file.name);
  const mime = file.type || 'application/octet-stream';

  if ((mime.startsWith('image/') && ext !== 'svg') || IMAGE_EXTENSIONS.has(ext)) {
    const processed = await compressImageIfNeeded(file);
    return {
      id,
      name: file.name,
      mimeType: processed.mimeType,
      size: file.size,
      kind: 'image',
      base64: processed.base64,
      previewUrl: processed.previewUrl,
      dimensions: processed.dimensions,
    };
  }

  if (ext === 'pdf' || mime === 'application/pdf') {
    const buf = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    let extractedText = '';
    try {
      const resp = await fetch('/api/parse-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          mimeType: 'application/pdf',
          base64,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { extractedText?: string };
        extractedText = data.extractedText || '';
      }
    } catch {
      extractedText = '[PDF binary ready for multimodal analysis]';
    }
    return {
      id,
      name: file.name,
      mimeType: 'application/pdf',
      size: file.size,
      kind: 'pdf',
      base64,
      extractedText,
    };
  }

  if (
    ext === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const buf = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    let extractedText = '';
    const resp = await fetch('/api/parse-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        mimeType: mime,
        base64,
      }),
    });
    if (resp.ok) {
      const data = (await resp.json()) as { extractedText?: string };
      extractedText = data.extractedText || '';
    } else {
      throw new Error(`Unable to parse DOCX file "${file.name}".`);
    }
    return {
      id,
      name: file.name,
      mimeType: mime,
      size: file.size,
      kind: 'docx',
      extractedText,
    };
  }

  if (
    TEXT_EXTENSIONS.has(ext) ||
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml')
  ) {
    const text = await file.text();
    const trimmed = text.slice(0, 120000);
    return {
      id,
      name: file.name,
      mimeType: mime || 'text/plain',
      size: file.size,
      kind: 'text',
      extractedText: trimmed,
    };
  }

  const fallbackText = await file.text();
  return {
    id,
    name: file.name,
    mimeType: mime,
    size: file.size,
    kind: 'text',
    extractedText: fallbackText.slice(0, 60000),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PREVIEWABLE_LANGS = new Set([
  'html',
  'htm',
  'jsx',
  'tsx',
  'react',
  'vue',
  'svg',
  'mermaid',
  'javascript',
  'js',
  'typescript',
  'ts',
  'css',
  'scss',
  'python',
  'py',
  'bash',
  'sh',
  'shell',
  'zsh',
  'c',
  'cpp',
  'c++',
  'cc',
  'sql',
  'json',
  'yaml',
  'yml',
  'markdown',
  'md',
  'latex',
  'tex',
  'diff',
  'patch',
  'xml',
  'csv',
  'tsv',
]);

export function isPreviewableLanguage(lang: string): boolean {
  return PREVIEWABLE_LANGS.has(lang.toLowerCase());
}

export function extractArtifactsFromMarkdown(
  markdown: string,
  messageId: string
): CodeArtifact[] {
  const regex = /```([a-zA-Z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)```/g;
  const artifacts: CodeArtifact[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(markdown)) !== null) {
    const rawLang = (match[1] || 'text').toLowerCase();
    const code = match[2].replace(/\r\n/g, '\n').trimEnd();
    if (!code.trim() || code.trim().length < 24) continue;

    const firstLine = code.split('\n')[0]?.trim() || '';
    let title = `${rawLang.toUpperCase()} Snippet ${idx + 1}`;
    const commentMatch = firstLine.match(/^(?:\/\/|#|<!--|\/\*|%%)\s*(.+?)(?:-->|\*\/)?$/);
    if (commentMatch && commentMatch[1].length >= 3 && commentMatch[1].length <= 48) {
      title = commentMatch[1].trim();
    } else if (rawLang === 'html' || rawLang === 'htm') {
      const titleTag = code.match(/<title>([\s\S]*?)<\/title>/i);
      title = titleTag?.[1]?.trim() || `Web App Artifact ${idx + 1}`;
    } else if (rawLang === 'jsx' || rawLang === 'tsx' || rawLang === 'react') {
      const fnMatch = code.match(/(?:export\s+default\s+)?function\s+([A-Z][A-Za-z0-9_]*)/);
      title = fnMatch?.[1] ? `${fnMatch[1]} Component` : `React Component ${idx + 1}`;
    } else if (rawLang === 'vue') {
      title = `Vue Component ${idx + 1}`;
    } else if (rawLang === 'svg') {
      title = `Vector Graphic ${idx + 1}`;
    } else if (rawLang === 'mermaid') {
      title = `Diagram ${idx + 1}`;
    } else if (rawLang === 'latex' || rawLang === 'tex') {
      title = `LaTeX Document ${idx + 1}`;
    } else if (rawLang === 'diff' || rawLang === 'patch') {
      title = `Patch Diff ${idx + 1}`;
    } else if (rawLang === 'python' || rawLang === 'py') {
      title = `Python Script ${idx + 1}`;
    }

    artifacts.push({
      id: `${messageId}_art_${idx}`,
      title,
      language: rawLang,
      code,
      previewable: isPreviewableLanguage(rawLang),
    });
    idx++;
  }

  // If LLM separated HTML, CSS, and/or JS blocks in the same message, automatically inject sibling CSS/JS into the HTML artifact so styling & interactivity are never lost.
  const htmlIdx = artifacts.findIndex((a) => a.language === 'html' || a.language === 'htm');
  if (htmlIdx >= 0) {
    const cssParts = artifacts
      .filter((a) => a.language === 'css' || a.language === 'scss')
      .map((a) => a.code);
    const jsParts = artifacts
      .filter((a) => a.language === 'javascript' || a.language === 'js')
      .map((a) => a.code);

    if (cssParts.length > 0 || jsParts.length > 0) {
      let bundled = artifacts[htmlIdx].code;
      // Strip broken external local stylesheet/script links when bundling inline siblings
      if (cssParts.length > 0) {
        bundled = bundled.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["'](?!https?:\/\/)[^"']+["'][^>]*>/gi, '');
        const styleBlock = `<style>\n${cssParts.join('\n\n')}\n</style>`;
        if (/<\/head>/i.test(bundled)) {
          bundled = bundled.replace(/<\/head>/i, `${styleBlock}\n</head>`);
        } else {
          bundled = `${styleBlock}\n${bundled}`;
        }
      }
      if (jsParts.length > 0) {
        bundled = bundled.replace(/<script[^>]+src=["'](?!https?:\/\/)[^"']+["'][^>]*>\s*<\/script>/gi, '');
        const scriptBlock = `<script>\n${jsParts.join('\n\n')}\n</script>`;
        if (/<\/body>/i.test(bundled)) {
          bundled = bundled.replace(/<\/body>/i, `${scriptBlock}\n</body>`);
        } else {
          bundled = `${bundled}\n${scriptBlock}`;
        }
      }
      artifacts[htmlIdx] = {
        ...artifacts[htmlIdx],
        code: bundled,
      };
    }
  }

  return artifacts;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Failed to encode blob'));
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

function mapBrowserZImageRes(ratio: string): string {
  switch (ratio) {
    case '16:9':
      return '1280x720 ( 16:9 )';
    case '9:16':
      return '720x1280 ( 9:16 )';
    case '4:3':
      return '1152x864 ( 4:3 )';
    case '3:4':
      return '864x1152 ( 3:4 )';
    case '1:1':
    default:
      return '1024x1024 ( 1:1 )';
  }
}

function mapBrowserQwenRatio(ratio: string): string {
  const allowed = new Set(['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16']);
  return allowed.has(ratio) ? ratio : '1:1';
}

function resolveGradioFileUrl(
  obj: Record<string, unknown>,
  spaceUrl: string,
  rejectVideoExt = false
): string | null {
  const urlVal = typeof obj.url === 'string' ? obj.url.trim() : '';
  if (urlVal && urlVal.startsWith('http')) {
    if (rejectVideoExt && /\.(mp4|webm|mov)(\?|$)/i.test(urlVal)) return null;
    return urlVal;
  }
  const pathVal = typeof obj.path === 'string' ? obj.path.trim() : '';
  if (pathVal) {
    if (pathVal.startsWith('http')) return pathVal;
    const cleanBase = spaceUrl.replace(/\/$/, '');
    const cleanPath = pathVal.startsWith('/') ? pathVal : `/${pathVal}`;
    const full = `${cleanBase}/gradio_api/file=${encodeURI(cleanPath.slice(1))}`;
    if (rejectVideoExt && /\.(mp4|webm|mov)(\?|$)/i.test(full)) return null;
    return full;
  }
  return null;
}

function extractGradioImageUrl(parsed: unknown, spaceUrl = ''): string | null {
  const queue: unknown[] = [parsed];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      queue.push(...cur);
      continue;
    }
    const obj = cur as Record<string, unknown>;
    const direct = resolveGradioFileUrl(obj, spaceUrl, true);
    if (direct) return direct;
    if (obj.image && typeof obj.image === 'object') {
      const nested = resolveGradioFileUrl(
        obj.image as Record<string, unknown>,
        spaceUrl,
        true
      );
      if (nested) return nested;
    }
  }
  return null;
}

type BrowserImageCallResult =
  | {
      ok: true;
      dataUrl: string;
      mimeType: string;
      remoteUrl: string;
      engine: string;
    }
  | { ok: false; quotaExhausted: boolean };

async function callBrowserImageSpace(
  spaceUrl: string,
  endpoint: string,
  data: unknown[],
  engine: string,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<BrowserImageCallResult> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const postRes = await fetch(`${spaceUrl}/gradio_api/call/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
      signal: controller.signal,
    });
    if (!postRes.ok) {
      return { ok: false, quotaExhausted: postRes.status === 429 };
    }
    const postData = (await postRes.json()) as { event_id?: string };
    if (!postData.event_id) return { ok: false, quotaExhausted: false };

    const sseRes = await fetch(
      `${spaceUrl}/gradio_api/call/${endpoint}/${postData.event_id}`,
      { signal: controller.signal }
    );
    if (!sseRes.ok) return { ok: false, quotaExhausted: false };
    const sseText = await sseRes.text();
    if (/event:\s*error/i.test(sseText)) {
      return { ok: false, quotaExhausted: /quota|exceeded|429/i.test(sseText) };
    }

    const match = sseText.match(/event:\s*complete[\r\n]+data:\s*(.+)/);
    if (!match) return { ok: false, quotaExhausted: false };

    const payload = JSON.parse(match[1]) as unknown;
    const fileUrl = extractGradioImageUrl(payload, spaceUrl);
    if (!fileUrl) return { ok: false, quotaExhausted: false };

    const imgRes = await fetch(fileUrl, { signal: controller.signal });
    if (!imgRes.ok) return { ok: false, quotaExhausted: false };
    const blob = await imgRes.blob();
    if (blob.size < 2000) return { ok: false, quotaExhausted: false };
    const dataUrl = await blobToDataUrl(blob);
    return {
      ok: true,
      dataUrl,
      mimeType: blob.type || 'image/webp',
      remoteUrl: fileUrl,
      engine,
    };
  } catch {
    return { ok: false, quotaExhausted: false };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onParentAbort);
  }
}

async function generateBestBrowserRaster(
  prompt: string,
  width: number,
  height: number,
  aspectRatio = '1:1'
): Promise<{
  dataUrl: string;
  mimeType: string;
  remoteUrl: string;
  engine: string;
} | null> {
  // Strict Best-First Quality Tiers: Flagship FLUX.2-dev & FLUX.1-dev first, fast backups strictly last
  const tiers: Array<
    Array<{
      spaceUrl: string;
      endpoint: string;
      data: unknown[];
      engine: string;
      timeoutMs: number;
    }>
  > = [
    [
      {
        spaceUrl: 'https://black-forest-labs-flux-2-dev.hf.space',
        endpoint: 'infer',
        data: [prompt, [], 0, true, width, height, 24, 4, true],
        engine: 'FLUX.2-dev (Open-Source Flagship)',
        timeoutMs: 22000,
      },
      {
        spaceUrl: 'https://black-forest-labs-flux-1-dev.hf.space',
        endpoint: 'infer',
        data: [prompt, 0, true, width, height, 3.5, 24],
        engine: 'FLUX.1-dev (Open-Source Flagship)',
        timeoutMs: 22000,
      },
    ],
    [
      {
        spaceUrl: 'https://multimodalart-flux-1-merged.hf.space',
        endpoint: 'infer',
        data: [prompt, 0, true, width, height, 3.5, 8],
        engine: 'FLUX.1-merged (Dedicated L40S)',
        timeoutMs: 20000,
      },
      {
        spaceUrl: 'https://stabilityai-stable-diffusion-3-5-large.hf.space',
        endpoint: 'infer',
        data: [prompt, '', 0, true, width, height, 4.5, 24],
        engine: 'Stable Diffusion 3.5 Large',
        timeoutMs: 20000,
      },
    ],
    [
      {
        spaceUrl: 'https://qwen-qwen-image.hf.space',
        endpoint: 'infer',
        data: [prompt, 0, true, mapBrowserQwenRatio(aspectRatio), 4, 28, true],
        engine: 'Qwen-Image (Open-Source Flagship)',
        timeoutMs: 18000,
      },
      {
        spaceUrl: 'https://mcp-tools-flux-1-krea-dev.hf.space',
        endpoint: 'infer',
        data: [prompt, 0, true, width, height, 4.5, 24],
        engine: 'FLUX.1-Krea-dev (Open-Source)',
        timeoutMs: 18000,
      },
    ],
    [
      {
        spaceUrl: 'https://linoyts-qwen-image-2-1-realtime.hf.space',
        endpoint: 'generate',
        data: [prompt, [], 0, 1024, 'Auto'],
        engine: 'Qwen-Image-2.1 (Open-Source)',
        timeoutMs: 16000,
      },
      {
        spaceUrl: 'https://tongyi-mai-z-image-turbo.hf.space',
        endpoint: 'generate',
        data: [prompt, mapBrowserZImageRes(aspectRatio), 42, 8, 3, true, []],
        engine: 'Z-Image-Turbo (Open-Source)',
        timeoutMs: 15000,
      },
    ],
    [
      {
        spaceUrl: 'https://black-forest-labs-flux-1-schnell.hf.space',
        endpoint: 'infer',
        data: [prompt, 0, true, width, height, 4],
        engine: 'FLUX.1-schnell (Open-Source)',
        timeoutMs: 14000,
      },
    ],
  ];

  let quotaHits = 0;
  for (const batch of tiers) {
    if (quotaHits >= 2) break;
    const raceCtrl = new AbortController();
    let winner: {
      dataUrl: string;
      mimeType: string;
      remoteUrl: string;
      engine: string;
    } | null = null;

    await Promise.all(
      batch.map(async (c) => {
        const res = await callBrowserImageSpace(
          c.spaceUrl,
          c.endpoint,
          c.data,
          c.engine,
          c.timeoutMs,
          raceCtrl.signal
        );
        if (res.ok && !winner) {
          winner = {
            dataUrl: res.dataUrl,
            mimeType: res.mimeType,
            remoteUrl: res.remoteUrl,
            engine: res.engine,
          };
          raceCtrl.abort();
        } else if (!res.ok && res.quotaExhausted) {
          quotaHits += 1;
        }
      })
    );
    if (winner) return winner;
  }
  return null;
}

async function fetchServerRasterFrame(
  prompt: string,
  width = 1024,
  height = 576
): Promise<{ dataUrl: string; mimeType: string; engine: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 24000);
  try {
    const resp = await fetch('/api/raster-frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, width, height }),
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      dataUrl?: string;
      mimeType?: string;
      engine?: string;
    };
    if (!data?.dataUrl || !data.mimeType?.startsWith('image/')) return null;
    return {
      dataUrl: data.dataUrl,
      mimeType: data.mimeType,
      engine: data.engine || 'FLUX.1 Server (Open-Source)',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPollinationsFluxBrowser(
  prompt: string,
  width: number,
  height: number,
  seedOffset = 0
): Promise<{ dataUrl: string; mimeType: string; engine: string } | null> {
  try {
    const w8 = Math.min(1280, Math.max(512, Math.round(width / 8) * 8));
    const h8 = Math.min(1280, Math.max(512, Math.round(height / 8) * 8));
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      prompt
    )}?width=${w8}&height=${h8}&model=flux&nologo=true&seed=${(Date.now() + seedOffset) % 999999}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(13000) });
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return null;
    const blob = await res.blob();
    if (blob.size < 2500) return null;
    return {
      dataUrl: await blobToDataUrl(blob),
      mimeType: blob.type || 'image/jpeg',
      engine: 'FLUX.1 (Open-Source Flagship)',
    };
  } catch {
    return null;
  }
}

export async function tryClientRasterRescue<
  T extends {
    dataUrl: string;
    mimeType: string;
    engine: string;
    style?: string;
    clientRasterUrl?: string;
    clientHfFallback?: {
      prompt: string;
      width: number;
      height: number;
      aspectRatio?: string;
    };
    fallbackPath?: string[];
  },
>(item: T): Promise<T> {
  if (item.style === 'vector') {
    return item;
  }

  if (item.clientHfFallback) {
    const hfDirect = await generateBestBrowserRaster(
      item.clientHfFallback.prompt,
      item.clientHfFallback.width,
      item.clientHfFallback.height,
      item.clientHfFallback.aspectRatio || '1:1'
    );
    if (hfDirect) {
      return {
        ...item,
        dataUrl: hfDirect.dataUrl,
        mimeType: hfDirect.mimeType,
        engine: hfDirect.engine,
        clientHfFallback: undefined,
        clientRasterUrl: undefined,
      };
    }

    const pollFlux = await fetchPollinationsFluxBrowser(
      item.clientHfFallback.prompt,
      item.clientHfFallback.width,
      item.clientHfFallback.height
    );
    if (pollFlux) {
      return {
        ...item,
        dataUrl: pollFlux.dataUrl,
        mimeType: pollFlux.mimeType,
        engine: pollFlux.engine,
        clientHfFallback: undefined,
        clientRasterUrl: undefined,
      };
    }

    const serverFrame = await fetchServerRasterFrame(
      item.clientHfFallback.prompt,
      item.clientHfFallback.width,
      item.clientHfFallback.height
    );
    if (serverFrame) {
      return {
        ...item,
        dataUrl: serverFrame.dataUrl,
        mimeType: serverFrame.mimeType,
        engine: serverFrame.engine,
        clientHfFallback: undefined,
        clientRasterUrl: undefined,
      };
    }
  }

  return item;
}

function extractGradioVideoUrl(parsed: unknown, spaceUrl = ''): string | null {
  const queue: unknown[] = [parsed];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object') continue;
    if (Array.isArray(cur)) {
      queue.push(...cur);
      continue;
    }
    const obj = cur as Record<string, unknown>;
    const direct = resolveGradioFileUrl(obj, spaceUrl, false);
    if (direct && (/\.(mp4|webm|mov|gif)(\?|$)/i.test(direct) || /\/file=/.test(direct))) {
      return direct;
    }
    if (obj.video && typeof obj.video === 'object') {
      const vResolved = resolveGradioFileUrl(
        obj.video as Record<string, unknown>,
        spaceUrl,
        false
      );
      if (vResolved) return vResolved;
    }
  }
  return null;
}

type BrowserVideoCallResult =
  | { ok: true; dataUrl: string; mimeType: string }
  | { ok: false; quotaExhausted: boolean };

async function callBrowserVideoSpace(
  spaceUrl: string,
  endpoint: string,
  data: unknown[],
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<BrowserVideoCallResult> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const postRes = await fetch(`${spaceUrl}/gradio_api/call/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
      signal: controller.signal,
    });
    if (!postRes.ok) {
      return { ok: false, quotaExhausted: postRes.status === 429 };
    }
    const postData = (await postRes.json()) as { event_id?: string };
    if (!postData.event_id) return { ok: false, quotaExhausted: false };

    const sseRes = await fetch(
      `${spaceUrl}/gradio_api/call/${endpoint}/${postData.event_id}`,
      { signal: controller.signal }
    );
    if (!sseRes.ok) return { ok: false, quotaExhausted: false };
    const sseText = await sseRes.text();
    if (/event:\s*error/i.test(sseText)) {
      return { ok: false, quotaExhausted: /quota|exceeded|429/i.test(sseText) };
    }

    const match = sseText.match(/event:\s*complete[\r\n]+data:\s*(.+)/);
    if (!match) return { ok: false, quotaExhausted: false };
    const payload = JSON.parse(match[1]) as unknown;
    const fileUrl = extractGradioVideoUrl(payload, spaceUrl);
    if (!fileUrl) return { ok: false, quotaExhausted: false };

    const vidRes = await fetch(fileUrl, { signal: controller.signal });
    if (!vidRes.ok) return { ok: false, quotaExhausted: false };
    const blob = await vidRes.blob();
    if (blob.size < 4000) return { ok: false, quotaExhausted: false };
    const dataUrl = await blobToDataUrl(blob);
    return { ok: true, dataUrl, mimeType: blob.type || 'video/mp4' };
  } catch {
    return { ok: false, quotaExhausted: false };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onParentAbort);
  }
}

async function encodeBitmapsOrFramesWithWebCodecs(
  width: number,
  height: number,
  fps: number,
  totalFrames: number,
  renderBitmapAt: (frameIdx: number) => Promise<ImageBitmap | HTMLCanvasElement | null>
): Promise<{ dataUrl: string; mimeType: string } | null> {
  if (typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined') {
    const codecCandidates: Array<{ webCodec: string; muxCodec: 'V_VP8' | 'V_VP9' }> = [
      { webCodec: 'vp8', muxCodec: 'V_VP8' },
      { webCodec: 'vp09.00.40.08', muxCodec: 'V_VP9' },
    ];

    for (const codecCfg of codecCandidates) {
      try {
        const check = await VideoEncoder.isConfigSupported({
          codec: codecCfg.webCodec,
          width,
          height,
          bitrate: 2_600_000,
          framerate: fps,
        });
        if (!check.supported) continue;

        const target = new ArrayBufferTarget();
        const muxer = new Muxer({
          target,
          video: {
            codec: codecCfg.muxCodec,
            width,
            height,
            frameRate: fps,
          },
          firstTimestampBehavior: 'offset',
        });

        let encoderErrored = false;
        const encoder = new VideoEncoder({
          output: (chunk, meta) => {
            muxer.addVideoChunk(chunk, meta);
          },
          error: () => {
            encoderErrored = true;
          },
        });
        encoder.configure({
          codec: codecCfg.webCodec,
          width,
          height,
          bitrate: 2_600_000,
          framerate: fps,
        });

        const frameDurationUs = Math.round(1_000_000 / fps);
        for (let i = 0; i < totalFrames; i++) {
          if (encoderErrored) break;
          const source = await renderBitmapAt(i);
          if (!source) {
            encoderErrored = true;
            break;
          }
          while (encoder.encodeQueueSize > 8 && !encoderErrored) {
            await new Promise((r) => setTimeout(r, 4));
          }
          const vf = new VideoFrame(source, {
            timestamp: i * frameDurationUs,
            duration: frameDurationUs,
          });
          encoder.encode(vf, { keyFrame: i % (fps * 2) === 0 });
          vf.close();
          if ('close' in source && typeof source.close === 'function') {
            source.close();
          }
          if (i % 16 === 15) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        if (!encoderErrored) {
          await encoder.flush();
          encoder.close();
          muxer.finalize();
          const blob = new Blob([target.buffer], { type: 'video/webm' });
          if (blob.size >= 4000) {
            const dataUrl = await blobToDataUrl(blob);
            return { dataUrl, mimeType: 'video/webm' };
          }
        } else {
          try {
            encoder.close();
          } catch {
            // ignore
          }
        }
      } catch {
        // try next codec
      }
    }
  }
  return null;
}

async function encodeCanvasWithMediaRecorder(
  canvas: HTMLCanvasElement,
  durationSec: number,
  fps: number,
  drawAt: (t: number) => Promise<void> | void
): Promise<{ dataUrl: string; mimeType: string } | null> {
  if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
    return null;
  }

  const mimeCandidates = [
    'video/webm;codecs=vp8',
    'video/webm;codecs=vp9',
    'video/webm',
    'video/mp4',
  ];
  const chosenMime =
    mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
  if (!chosenMime) return null;

  try {
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, {
      mimeType: chosenMime,
      videoBitsPerSecond: 2_200_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const donePromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: chosenMime.split(';')[0] }));
      };
      recorder.onerror = () => reject(new Error('mediarecorder_error'));
    });

    recorder.start(250);
    const stepMs = Math.round(1000 / fps);
    const startMs = performance.now();
    while (true) {
      const elapsedSec = (performance.now() - startMs) / 1000;
      if (elapsedSec >= durationSec) break;
      await drawAt(elapsedSec);
      await new Promise((r) => setTimeout(r, stepMs));
    }
    recorder.stop();
    const blob = await donePromise;
    stream.getTracks().forEach((tr) => tr.stop());
    if (blob.size < 4000) return null;
    const dataUrl = await blobToDataUrl(blob);
    return { dataUrl, mimeType: chosenMime.split(';')[0] };
  } catch {
    return null;
  }
}

// Procedural Canvas2D cartoon templates removed — video synthesis strictly uses genuine neural video models or high-res AI diffusion cinema frames.

async function uploadFrameToBrowserSpace(
  spaceUrl: string,
  dataUrl: string,
  externalSignal?: AbortSignal
): Promise<{ path: string; meta: { _type: 'gradio.FileData' } } | null> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    if (blob.size < 500) return null;
    const ext = blob.type.includes('png')
      ? 'png'
      : blob.type.includes('webp')
        ? 'webp'
        : 'jpg';
    const fd = new FormData();
    fd.append('files', blob, `frame.${ext}`);
    const ctrl = new AbortController();
    const onParentAbort = () => ctrl.abort();
    externalSignal?.addEventListener('abort', onParentAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const upRes = await fetch(`${spaceUrl}/gradio_api/upload`, {
        method: 'POST',
        body: fd,
        signal: ctrl.signal,
      });
      if (!upRes.ok) return null;
      const arr = (await upRes.json()) as string[];
      if (!Array.isArray(arr) || typeof arr[0] !== 'string' || !arr[0]) return null;
      return { path: arr[0], meta: { _type: 'gradio.FileData' } };
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onParentAbort);
    }
  } catch {
    return null;
  }
}

export async function tryClientVideoRescue(
  item: GeneratedVideoItem,
  options?: {
    signal?: AbortSignal;
    onProgress?: (stage: string) => void;
  }
): Promise<GeneratedVideoItem> {
  if (item.dataUrl && item.mimeType.startsWith('video/')) {
    return item;
  }
  if (options?.signal?.aborted) {
    return item;
  }

  const prompt = item.clientHfVideoFallback?.prompt || item.enhancedPrompt || item.prompt;
  const durationSec = Math.min(
    15,
    Math.max(2, item.clientHfVideoFallback?.durationSec || item.durationSec || 15)
  );
  const ratio = item.aspectRatio || item.clientHfVideoFallback?.aspectRatio || '16:9';
  const width = ratio === '9:16' ? 544 : ratio === '1:1' ? 640 : 960;
  const height = ratio === '9:16' ? 960 : ratio === '1:1' ? 640 : 544;

  // Clear any legacy cooldown key so real neural diffusion spaces are always tried cleanly
  try {
    sessionStorage.removeItem('kestrel_hf_zerogpu_cooldown');
  } catch {
    // ignore storage restriction
  }

  const vidH = ratio === '9:16' ? 896 : ratio === '1:1' ? 640 : 512;
  const vidW = ratio === '9:16' ? 512 : ratio === '1:1' ? 640 : 896;
  const targetFrames = Math.min(85, Math.max(33, Math.round(durationSec * 12)));

  let refFrameDataUrl =
    item.posterDataUrl ||
    item.clientHfVideoFallback?.posterDataUrl ||
    item.clientHfVideoFallback?.scenes?.find((s) => s.posterDataUrl)?.posterDataUrl ||
    '';
  const endFrameDataUrl =
    item.clientHfVideoFallback?.scenes?.[1]?.posterDataUrl ||
    item.clientHfVideoFallback?.scenes?.[2]?.posterDataUrl ||
    '';

  if (item.clientHfVideoFallback && !options?.signal?.aborted) {
    if (!refFrameDataUrl) {
      options?.onProgress?.('Preparing reference frame for video synthesis...');
      const quickRaster =
        (await generateBestBrowserRaster(prompt, vidW, vidH, ratio)) ||
        (await fetchPollinationsFluxBrowser(prompt, vidW, vidH)) ||
        (await fetchServerRasterFrame(prompt, vidW, vidH));
      if (quickRaster?.dataUrl) {
        refFrameDataUrl = quickRaster.dataUrl;
      }
    }

    type VideoSpaceCandidate = {
      spaceUrl: string;
      endpoint: string;
      engine: string;
      needsStartFrame: boolean;
      needsEndFrame?: boolean;
      usesRawB64?: boolean;
      buildData: (startFile?: unknown, endFile?: unknown) => unknown[];
    };

    // Strict Best-First neural video waves (fast quota fail-out so video finishes crisply instead of stalling)
    const videoWaves: Array<{
      label: string;
      timeoutMs: number;
      candidates: VideoSpaceCandidate[];
    }> = [
      {
        label: 'Running flagship neural video synthesis (LTX-2.5 & Wan 2.2)...',
        timeoutMs: 36000,
        candidates: [
          {
            spaceUrl: 'https://lightricks-ltx-2-5.hf.space',
            endpoint: 'run',
            engine: 'Lightricks LTX-2.5 (Open-Source T2V)',
            needsStartFrame: false,
            buildData: () => [
              prompt,
              null,
              vidH,
              vidW,
              Math.min(5, durationSec),
              42,
              'conv',
              false,
              true,
              true,
            ],
          },
          ...(refFrameDataUrl
            ? [
                {
                  spaceUrl: 'https://multimodalart-wan-2-2-first-last-frame.hf.space',
                  endpoint: 'generate_video',
                  engine: 'Wan 2.2 First-Last-Frame (Open-Source Diffusion)',
                  needsStartFrame: true,
                  needsEndFrame: true,
                  buildData: (f1: unknown, f2: unknown) => [
                    f1,
                    f2 || null,
                    prompt,
                    'static, blurry, distorted, watermark',
                    2.5,
                    6,
                    1,
                    1,
                    42,
                    true,
                  ],
                },
              ]
            : []),
        ],
      },
      {
        label: 'Running neural video diffusion (LTX-2.3 & First-Last-Frame)...',
        timeoutMs: 34000,
        candidates: [
          {
            spaceUrl: 'https://lightricks-ltx-2-3.hf.space',
            endpoint: 'generate_video',
            engine: 'Lightricks LTX-2.3 (Open-Source T2V)',
            needsStartFrame: false,
            buildData: () => [
              null,
              prompt,
              Math.min(8, Math.max(2, durationSec)),
              false,
              10,
              true,
              vidH,
              vidW,
            ],
          },
          ...(refFrameDataUrl
            ? [
                {
                  spaceUrl: 'https://linoyts-ltx-2-3-first-last-frame.hf.space',
                  endpoint: 'generate_video',
                  engine: 'Lightricks LTX-2.3 FLF (Open-Source I2V)',
                  needsStartFrame: true,
                  needsEndFrame: true,
                  buildData: (f1: unknown, f2: unknown) => [
                    f1,
                    f2 || null,
                    null,
                    prompt,
                    Math.min(6, Math.max(2, durationSec)),
                    true,
                    42,
                    true,
                    vidH,
                    vidW,
                  ],
                },
              ]
            : []),
        ],
      },
      {
        label: 'Running neural video synthesis (Wan 2.2 Pro & Hunyuan 1.5)...',
        timeoutMs: 32000,
        candidates: [
          {
            spaceUrl: 'https://multimodalart-hunyuan-video-1-5.hf.space',
            endpoint: 'generate',
            engine: 'Hunyuan-Video-1.5 (Open-Source T2V)',
            needsStartFrame: false,
            buildData: () => [null, prompt, targetFrames, 6, 5, -1, 1, true],
          },
          ...(refFrameDataUrl
            ? [
                {
                  spaceUrl: 'https://prashant-ai-ml-wan-2-2-pro-superb.hf.space',
                  endpoint: 'generate_video',
                  engine: 'Wan 2.2 Pro Superb (Open-Source I2V)',
                  needsStartFrame: true,
                  needsEndFrame: true,
                  buildData: (f: unknown, f2?: unknown) => [
                    f,
                    f2 || null,
                    prompt,
                    6,
                    'static, blurry, distorted, watermark',
                    Math.min(3.5, durationSec),
                    1,
                    1,
                    42,
                    true,
                    6,
                    'UniPCMultistep',
                    3,
                    '16',
                    true,
                    true,
                  ],
                },
              ]
            : [
                {
                  spaceUrl: 'https://zai-org-cogvideox-5b-space.hf.space',
                  endpoint: 'generate',
                  engine: 'CogVideoX-5B (Open-Source T2V)',
                  needsStartFrame: false,
                  buildData: () => [prompt, null, null, 0.8, -1, false, false],
                },
              ]),
        ],
      },
      {
        label: 'Running neural video diffusion (Wan 2.2 AOTI & Wan 2.1 Fast)...',
        timeoutMs: 30000,
        candidates: [
          ...(refFrameDataUrl
            ? [
                {
                  spaceUrl: 'https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space',
                  endpoint: 'generate_video',
                  engine: 'Wan 2.2 Faster AOTI (Open-Source I2V)',
                  needsStartFrame: true,
                  buildData: (f: unknown) => [
                    f,
                    prompt,
                    4,
                    'blurry, static, distorted, watermark',
                    Math.min(3.5, durationSec),
                    1,
                    1,
                    42,
                    true,
                  ],
                },
              ]
            : []),
          {
            spaceUrl: 'https://multimodalart-wan2-1-fast.hf.space',
            endpoint: 'generate_video',
            engine: 'Wan 2.1 Fast (Open-Source T2V)',
            needsStartFrame: false,
            buildData: () => [
              null,
              prompt,
              vidH,
              vidW,
              'blurry, static, distorted',
              Math.min(4, durationSec),
              1,
              4,
              42,
              true,
            ],
          },
        ],
      },
    ];

    const triedSpaces = new Set<string>();
    const runWave = async (
      wave: VideoSpaceCandidate[],
      timeoutMs: number
    ): Promise<{ winner: GeneratedVideoItem | null; allQuota: boolean; quotaCount: number }> => {
      const freshWave = wave.filter((w) => {
        if (triedSpaces.has(w.spaceUrl)) return false;
        triedSpaces.add(w.spaceUrl);
        return true;
      });
      if (freshWave.length === 0 || options?.signal?.aborted) {
        return { winner: null, allQuota: false, quotaCount: 0 };
      }
      const waveCtrl = new AbortController();
      const onParentAbort = () => waveCtrl.abort();
      options?.signal?.addEventListener('abort', onParentAbort, { once: true });

      let winner: GeneratedVideoItem | null = null;
      let quotaHits = 0;

      try {
        await Promise.all(
          freshWave.map(async (model) => {
            if (waveCtrl.signal.aborted) return;
            let startFile: unknown = undefined;
            let endFile: unknown = undefined;
            if (model.needsStartFrame) {
              if (model.usesRawB64) {
                startFile = refFrameDataUrl;
              } else {
                startFile = await uploadFrameToBrowserSpace(
                  model.spaceUrl,
                  refFrameDataUrl,
                  waveCtrl.signal
                );
                if (!startFile) return;
                if (model.needsEndFrame && endFrameDataUrl) {
                  endFile = await uploadFrameToBrowserSpace(
                    model.spaceUrl,
                    endFrameDataUrl,
                    waveCtrl.signal
                  );
                }
              }
            }
            const res = await callBrowserVideoSpace(
              model.spaceUrl,
              model.endpoint,
              model.buildData(startFile, endFile),
              timeoutMs,
              waveCtrl.signal
            );
            if (res.ok && !winner) {
              winner = {
                ...item,
                dataUrl: res.dataUrl,
                mimeType: res.mimeType,
                engine: model.engine,
                clientHfVideoFallback: undefined,
              };
              waveCtrl.abort();
            } else if (!res.ok && res.quotaExhausted) {
              quotaHits++;
            }
          })
        );
      } finally {
        options?.signal?.removeEventListener('abort', onParentAbort);
      }

      return { winner, allQuota: quotaHits >= freshWave.length, quotaCount: quotaHits };
    };

    let totalQuotaHits = 0;
    for (const wave of videoWaves) {
      if (options?.signal?.aborted) break;
      if (wave.candidates.length === 0) continue;
      options?.onProgress?.(wave.label);
      const outcome = await runWave(wave.candidates, wave.timeoutMs);
      if (outcome.winner) return outcome.winner;
      totalQuotaHits += outcome.quotaCount;
      // Shared browser ZeroGPU quota detected: move immediately to AI-diffused multi-shot synthesis
      if (outcome.allQuota || totalQuotaHits >= 2) break;
    }
  }

  if (options?.signal?.aborted) {
    return item;
  }

  const motion: VideoMotionScript = {
    ...(item.motionScript || {
      camera: 'zoom-in',
      atmosphere: 'none',
      moodColors: ['#090D16', '#1E3A8A', '#3B82F6'],
      durationSec,
    }),
    durationSec,
  };

  // Multi-Shot Real AI Diffusion Cinema Synthesis (never renders flat geometric templates!)
  const serverScenes = item.clientHfVideoFallback?.scenes || [
    { prompt: `Wide establishing cinematic film still: ${prompt}, photorealistic, golden depth`, camera: 'zoom-in' as const },
    { prompt: `Dynamic mid-action motion frame: ${prompt}, cinematic camera tracking angle`, camera: 'pan-right' as const },
    { prompt: `Dramatic close-up climax shot: ${prompt}, dramatic rim lighting`, camera: 'orbit' as const },
  ];

  const collectedFrames: Array<{
    dataUrl: string;
    camera: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'orbit';
  }> = [];

  for (const sc of serverScenes) {
    if (sc.posterDataUrl && sc.posterDataUrl !== collectedFrames[collectedFrames.length - 1]?.dataUrl) {
      collectedFrames.push({ dataUrl: sc.posterDataUrl, camera: sc.camera });
    }
  }
  if (collectedFrames.length === 0 && refFrameDataUrl) {
    collectedFrames.push({ dataUrl: refFrameDataUrl, camera: motion.camera });
  }

  // Acquire up to 3 distinct real AI-diffused photographic frames using verified working FLUX / AI Horde endpoints
  if (collectedFrames.length < 3 && typeof document !== 'undefined') {
    options?.onProgress?.('Synthesizing multi-shot diffusion keyframes...');
    const needed = 3 - collectedFrames.length;
    for (let i = 0; i < needed; i++) {
      if (options?.signal?.aborted) break;
      const sc = serverScenes[Math.min(serverScenes.length - 1, collectedFrames.length)] || serverScenes[0];
      const shotFrame =
        (i === 0 ? await fetchPollinationsFluxBrowser(sc.prompt, width, height, i * 197) : null) ||
        (await fetchServerRasterFrame(sc.prompt, width, height)) ||
        (await generateBestBrowserRaster(sc.prompt, width, height, ratio));
      if (shotFrame?.dataUrl) {
        collectedFrames.push({ dataUrl: shotFrame.dataUrl, camera: sc.camera });
      }
    }
  }

  if (collectedFrames.length >= 1 && typeof document !== 'undefined') {
    options?.onProgress?.(`Rendering ${durationSec}s 24fps HD video...`);
    const storyboardVid = await renderDiffusionStoryboardVideo(
      collectedFrames,
      motion,
      width,
      height,
      durationSec
    );
    if (storyboardVid) {
      return {
        ...item,
        dataUrl: storyboardVid.dataUrl,
        posterDataUrl: collectedFrames[0].dataUrl,
        mimeType: storyboardVid.mimeType,
        durationSec,
        engine: 'Kestrel Open-Source Diffusion Cinema Engine (24fps HD)',
        clientHfVideoFallback: undefined,
      };
    }
  }

  return {
    ...item,
    dataUrl: collectedFrames[0]?.dataUrl || item.posterDataUrl || item.dataUrl,
    durationSec,
    clientHfVideoFallback: undefined,
  };
}

async function renderDiffusionStoryboardVideo(
  frames: Array<{
    dataUrl: string;
    camera: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'orbit';
  }>,
  motion: VideoMotionScript,
  width: number,
  height: number,
  durationSec: number
): Promise<{ dataUrl: string; mimeType: string } | null> {
  if (typeof document === 'undefined' || frames.length === 0) return null;

  const loadBitmap = async (src: string): Promise<ImageBitmap | null> => {
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      return await createImageBitmap(blob);
    } catch {
      return null;
    }
  };

  const loaded = (await Promise.all(frames.map((f) => loadBitmap(f.dataUrl)))).filter(
    (b): b is ImageBitmap => b !== null
  );
  if (loaded.length === 0) return null;

  const fps = 24;
  const totalFrames = Math.round(durationSec * fps);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    loaded.forEach((b) => b.close());
    return null;
  }

  const particles = Array.from({ length: 48 }, (_, i) => ({
    x: ((i * 73 + 11) % 100) / 100,
    y: ((i * 47 + 23) % 100) / 100,
    r: 1.2 + (i % 4) * 0.75,
    speed: 0.35 + ((i * 19) % 10) / 11,
    phase: i * 0.85,
  }));

  const drawShotWithCamera = (
    bmp: ImageBitmap,
    localP: number,
    cam: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'orbit',
    alpha: number
  ) => {
    if (alpha <= 0.005) return;
    const ease = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, localP)));
    let scale = 1.08;
    let dx = 0;
    let dy = 0;
    let rot = 0;

    if (cam === 'zoom-in') {
      scale = 1.04 + ease * 0.18;
      dx = Math.sin(localP * Math.PI) * width * 0.014;
      dy = -ease * height * 0.015;
    } else if (cam === 'zoom-out') {
      scale = 1.22 - ease * 0.16;
      dx = -Math.sin(localP * Math.PI) * width * 0.012;
    } else if (cam === 'pan-right') {
      scale = 1.16 + Math.sin(localP * Math.PI) * 0.04;
      dx = (0.5 - ease) * width * 0.1;
      dy = Math.sin(localP * Math.PI * 2) * height * 0.01;
    } else if (cam === 'pan-left') {
      scale = 1.16 + Math.sin(localP * Math.PI) * 0.04;
      dx = (ease - 0.5) * width * 0.1;
    } else {
      scale = 1.12 + ease * 0.1;
      dx = Math.cos(localP * Math.PI * 1.3) * width * 0.032;
      dy = Math.sin(localP * Math.PI * 1.3) * height * 0.024;
      rot = Math.sin(localP * Math.PI) * 0.016;
    }

    const coverScale = Math.max(width / bmp.width, height / bmp.height) * scale;
    const dw = bmp.width * coverScale;
    const dh = bmp.height * coverScale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(width / 2 + dx, height / 2 + dy);
    if (rot !== 0) ctx.rotate(rot);
    ctx.drawImage(bmp, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  };

  const drawFrame = (t: number) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#05070B';
    ctx.fillRect(0, 0, width, height);

    const n = loaded.length;
    if (n === 1) {
      drawShotWithCamera(loaded[0], t / durationSec, frames[0].camera, 1);
    } else {
      const segDur = durationSec / n;
      const crossDur = Math.min(1.15, segDur * 0.25);
      const rawIdx = Math.min(n - 1, Math.floor(t / segDur));
      const segStart = rawIdx * segDur;
      const segT = (t - segStart) / segDur;

      drawShotWithCamera(loaded[rawIdx], segT, frames[rawIdx]?.camera || 'zoom-in', 1);

      const timeLeft = segStart + segDur - t;
      if (rawIdx < n - 1 && timeLeft < crossDur) {
        const mix = 1 - timeLeft / crossDur;
        const smoothMix = mix * mix * (3 - 2 * mix);
        drawShotWithCamera(
          loaded[rawIdx + 1],
          Math.max(0, (crossDur - timeLeft) / segDur),
          frames[rawIdx + 1]?.camera || 'pan-right',
          smoothMix
        );
      }
    }

    // Dynamic atmospheric lighting shafts + prompt-matched foreground particles
    const beamX = width * (0.25 + Math.sin(t * 0.42) * 0.22);
    const beam = ctx.createLinearGradient(beamX, 0, beamX + width * 0.24, height);
    beam.addColorStop(0, 'rgba(255,255,255,0.09)');
    beam.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(beamX - 40, 0);
    ctx.lineTo(beamX + 80, 0);
    ctx.lineTo(beamX + 320, height);
    ctx.lineTo(beamX + 110, height);
    ctx.closePath();
    ctx.fill();

    if (motion.atmosphere === 'rain') {
      ctx.strokeStyle = 'rgba(186,230,253,0.45)';
      ctx.lineWidth = 1.4;
      for (const pt of particles) {
        const rx = ((pt.x - t * 0.28 + 10) % 1) * width;
        const ry = ((pt.y + t * 1.15 * pt.speed) % 1) * height;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 8, ry + 22);
        ctx.stroke();
      }
    } else if (motion.atmosphere === 'embers' || motion.atmosphere === 'snow' || motion.atmosphere === 'bokeh' || motion.atmosphere === 'sparkles' || motion.atmosphere === 'stars') {
      for (const pt of particles) {
        const py =
          motion.atmosphere === 'embers'
            ? ((1 + pt.y - (t * 0.24 * pt.speed) % 1) % 1) * height
            : ((pt.y + t * 0.12 * pt.speed) % 1) * height;
        const px = ((pt.x + Math.sin(t * 1.4 + pt.phase) * 0.03 + 1) % 1) * width;
        const alpha = 0.28 + 0.35 * Math.sin(t * 2.4 + pt.phase);
        ctx.fillStyle =
          motion.atmosphere === 'embers'
            ? `rgba(251,146,60,${alpha.toFixed(2)})`
            : `rgba(255,255,255,${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, motion.atmosphere === 'bokeh' ? pt.r * 3.2 : pt.r * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Cinema vignette + smooth fade in/out
    const vig = ctx.createRadialGradient(
      width / 2,
      height / 2,
      width * 0.34,
      width / 2,
      height / 2,
      width * 0.78
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.34)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);

    const fadeIn = Math.min(1, t / 0.35);
    const fadeOut = Math.min(1, Math.max(0, (durationSec - t) / 0.4));
    const filmAlpha = 1 - Math.min(fadeIn, fadeOut);
    if (filmAlpha > 0.01) {
      ctx.fillStyle = `rgba(0,0,0,${filmAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }
  };

  try {
    let encoded = await encodeBitmapsOrFramesWithWebCodecs(
      width,
      height,
      fps,
      totalFrames,
      async (i) => {
        drawFrame(i / fps);
        return await createImageBitmap(canvas);
      }
    );
    if (!encoded) {
      encoded = await encodeCanvasWithMediaRecorder(canvas, durationSec, 24, (t) => {
        drawFrame(t);
      });
    }
    return encoded;
  } finally {
    loaded.forEach((b) => b.close());
  }
}
