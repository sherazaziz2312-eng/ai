import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { execFile } from "child_process";
import { builtinModules } from "module";
import { promisify } from "util";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import AdmZip from "adm-zip";
import sharp from "sharp";
import { extractText as extractPdfViaPdfJs } from "unpdf";
import * as esbuild from "esbuild";

const execFileAsync = promisify(execFile);
import {
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentResponse,
  type Part,
} from "@google/genai";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

interface IncomingAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "pdf" | "text" | "docx";
  base64?: string;
  extractedText?: string;
  dimensions?: { width: number; height: number };
}

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: IncomingAttachment[];
}

interface ChatRequestBody {
  messages: IncomingMessage[];
  mode?: "chat" | "code" | "image" | "docs";
  thinkingLevel?: "LOW" | "MEDIUM" | "HIGH" | "XHIGH";
  useWebSearch?: boolean;
}

interface ImageRequestBody {
  prompt: string;
  aspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  style?: "photorealistic" | "editorial" | "vector" | "3d-render" | "concept-art";
  enhancePrompt?: boolean;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function getHfHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const hfToken = process.env.HF_TOKEN?.trim();
  if (hfToken && hfToken !== "MY_HF_TOKEN") {
    return { ...extra, Authorization: `Bearer ${hfToken}` };
  }
  return extra;
}

function mapThinkingLevel(level?: string): ThinkingLevel {
  switch (level) {
    case "LOW":
      return ThinkingLevel.LOW;
    case "MEDIUM":
      return ThinkingLevel.MEDIUM;
    case "XHIGH":
      return ThinkingLevel.XHIGH;
    case "HIGH":
    default:
      return ThinkingLevel.HIGH;
  }
}

function buildSystemInstruction(mode: string): string {
  const base =
    "You are Kestrel AI, a sharp, reliable, and deeply capable AI assistant. Write clear Markdown with clean structure and concise prose.";

  if (mode === "code") {
    return `${base}
You are operating in Code & Live Workbench mode — master of every programming language, web framework, UI system, systems language, and data runtime.
Deliver 100% complete, bug-free, richly styled, immediately runnable code that executes automatically inside Kestrel:
1. Give a brief 1-2 sentence overview before the code artifact.
2. Wrap code in a single fenced code block with an explicit language tag and a descriptive comment on line 1 (e.g. \`// Real-Time Portfolio Analytics\` or \`# Monte Carlo Option Pricer\`).
3. STRICT COMPLETENESS, VISUAL CRAFT & ZERO-MISTAKE RULES:
   - **Web (\`html\`)**: ALWAYS write a SINGLE complete self-contained \`<!DOCTYPE html>\` file containing rich, comprehensive **inline \`<style>\` CSS** (\`:root\` design tokens, clean typography hierarchy, Flexbox/Grid layout, crisp card borders, contrast, spacing, smooth hover/focus transitions, responsive breakpoints) AND full interactive \`<script>\` JavaScript with realistic pre-populated data (6+ sample records/items). NEVER write bare unstyled HTML without complete \`<style>\` CSS, NEVER split HTML and CSS into separate blocks when building a web app, and NEVER reference broken relative files like \`./style.css\` or \`./app.js\`.
   - **React / UI (\`tsx\` or \`jsx\`)**: Export a default \`App\` function (\`export default function App()\`). Use cohesive Tailwind CSS utility classes, rich layout density (KPIs, interactive tabs, search/filters, modals/drawers, working state), realistic initial data, and genuine standard \`lucide-react\` icons (\`Search\`, \`Plus\`, \`Check\`, \`X\`, \`ArrowRight\`, \`Settings\`, \`Sparkles\`, \`BarChart3\`, \`TrendingUp\`, \`Calendar\`, etc.). React 19 hooks (\`useState\`, \`useEffect\`, \`useMemo\`, \`useRef\`, \`useCallback\`, \`useId\`), TypeScript types, \`lucide-react\`, \`framer-motion\` / \`motion/react\`, and npm ESM packages run live automatically. NEVER import non-existent local files (\`./styles.css\`, \`./utils\`), NEVER write \`TODO\` stubs or partial code, and verify every JSX closing tag and TypeScript annotation.
   - **Python (\`python\`), JS/TS (\`javascript\` / \`typescript\`), Bash (\`bash\`), C (\`c\`), C++ (\`cpp\`), SQL (\`sql\`)**: Complete, non-trivial programs with all required headers/imports that produce clean, formatted output (\`print()\`, \`console.log()\`, \`printf()\`, \`SELECT\`, \`plt.show()\`) without blocking on interactive stdin (\`input()\`, \`scanf()\`).
   - **SVG (\`svg\`), Mermaid (\`mermaid\`), CSS (\`css\`), JSON/YAML/XML/CSV/Markdown/LaTeX**: Valid, complete, self-contained artifacts.
4. Double-check every variable name, import specifier, bracket, CSS property, and runtime edge case (null guards, empty arrays, division by zero) before answering so code compiles and renders cleanly on the first pass.`;
  }

  return `${base}
- Provide clear, structured answers with helpful headings, bullet points, code examples, and comparison tables where appropriate.
- Use LaTeX math ($...$ or $$...$$) for formulas and \`\`\`mermaid blocks for flowcharts or architecture diagrams when useful.
- When writing any web page or UI code, ALWAYS output a SINGLE complete self-contained \`\`\`html\`\`\` (with full inline \`<style>\` CSS + interactive \`<script>\` JS) or \`\`\`tsx\`\`\` block — NEVER write unstyled HTML missing CSS, and NEVER reference broken local imports so it executes automatically in Kestrel's Live Workbench.
- When writing Python, JavaScript, TypeScript, SQL, Bash, C, or C++, make it 100% self-contained and runnable with clear output.
- When analyzing uploaded images, PDFs, DOCX files, spreadsheets, or code files, reference exact details, metrics, and sections directly from the attachment.
- For video generation requests, the default clip duration is 15 seconds (15s) and the maximum duration in one attempt is 15 seconds (15s).`;
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)>"']+/g) || [];
  return Array.from(new Set(matches)).slice(0, 5);
}

function extractPdfTextFallback(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];

  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(raw)) !== null) {
    const streamBytes = Buffer.from(match[1], "latin1");
    let decoded = "";
    try {
      decoded = zlib.inflateSync(streamBytes).toString("latin1");
    } catch {
      decoded = streamBytes.toString("latin1");
    }

    const textMatches = decoded.match(/\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*(?:Tj|'|")/g);
    if (textMatches) {
      for (const tm of textMatches) {
        const inner = tm.replace(/\)\s*(?:Tj|'|")$/, "").slice(1);
        const cleaned = inner
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "")
          .replace(/\\t/g, " ")
          .replace(/\\\(/g, "(")
          .replace(/\\\)/g, ")")
          .replace(/\\\\/g, "\\");
        if (cleaned.trim()) chunks.push(cleaned);
      }
    }

    const tjArrayMatches = decoded.match(/\[([\s\S]*?)\]\s*TJ/g);
    if (tjArrayMatches) {
      for (const arr of tjArrayMatches) {
        const parts = arr.match(/\(([^()\\]*(?:\\.[^()\\]*)*)\)/g);
        if (parts) {
          const line = parts
            .map((p) =>
              p
                .slice(1, -1)
                .replace(/\\\(/g, "(")
                .replace(/\\\)/g, ")")
                .replace(/\\\\/g, "\\")
            )
            .join("");
          if (line.trim()) chunks.push(line);
        }
      }
    }
  }

  let result = chunks.join(" ").replace(/\s{2,}/g, " ").trim();
  if (result.length < 40) {
    const asciiRuns = raw.match(/[A-Za-z0-9 ,.;:!?'"()\-/%$@&\n]{12,}/g) || [];
    const filtered = asciiRuns.filter(
      (s) =>
        !/^(endobj|endstream|obj|xref|trailer|FlateDecode|Type|Catalog|Pages)/.test(
          s.trim()
        )
    );
    result = filtered.slice(0, 250).join("\n").trim();
  }

  return result.slice(0, 60000);
}

function extractDocxText(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const docEntry = zip.getEntry("word/document.xml");
  if (!docEntry) {
    throw new Error("Invalid DOCX archive: missing word/document.xml");
  }
  const xml = docEntry.getData().toString("utf8");
  const text = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.slice(0, 80000);
}

function buildGeminiContents(
  messages: IncomingMessage[],
  includeBinaryAttachments: boolean
): Content[] {
  const rawContents: Content[] = messages.map((msg) => {
    const parts: Part[] = [];
    if (msg.attachments && msg.attachments.length > 0) {
      for (const att of msg.attachments) {
        if (
          includeBinaryAttachments &&
          att.base64 &&
          att.base64.trim().length > 0 &&
          (att.kind === "image" || att.kind === "pdf")
        ) {
          parts.push({
            inlineData: {
              mimeType: att.mimeType || (att.kind === "pdf" ? "application/pdf" : "image/png"),
              data: att.base64,
            },
          });
          parts.push({
            text: `[Attached ${att.kind.toUpperCase()}: ${att.name} (${Math.round(att.size / 1024)} KB)]`,
          });
        } else if (att.extractedText) {
          parts.push({
            text: `\n--- Attached File: ${att.name} (${att.mimeType}) ---\n${att.extractedText.slice(0, 45000)}\n--- End of ${att.name} ---\n`,
          });
        } else if (att.kind === "image") {
          const dimText = att.dimensions
            ? ` ${att.dimensions.width}x${att.dimensions.height}`
            : "";
          parts.push({
            text: `[Attached Image: ${att.name}${dimText}, ${Math.round(att.size / 1024)} KB]`,
          });
        } else {
          parts.push({
            text: `[Attached File: ${att.name} (${att.mimeType}, ${Math.round(att.size / 1024)} KB)]`,
          });
        }
      }
    }

    if (msg.content.trim()) {
      parts.push({ text: msg.content });
    } else if (parts.length === 0) {
      parts.push({ text: "Analyze the attached content." });
    }

    return {
      role: msg.role === "assistant" ? "model" : "user",
      parts,
    };
  });

  // Ensure valid role ordering for Gemini: starts with user and merges consecutive same-role turns
  while (rawContents.length > 0 && rawContents[0].role === "model") {
    rawContents.shift();
  }
  const normalized: Content[] = [];
  for (const item of rawContents) {
    const prev = normalized[normalized.length - 1];
    if (prev && prev.role === item.role) {
      prev.parts = [...(prev.parts || []), ...(item.parts || [])];
    } else {
      normalized.push(item);
    }
  }
  return normalized;
}

function classifyGeminiError(err: unknown): {
  status: number;
  message: string;
  isKeyError: boolean;
} {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  const isKeyError =
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid") ||
    lower.includes("permission_denied") ||
    lower.includes("403");
  const status = isKeyError
    ? 403
    : lower.includes("429") || lower.includes("resource_exhausted")
      ? 429
      : lower.includes("400")
        ? 400
        : 500;
  return { status, message: msg, isKeyError };
}

interface OpenSourceModelEntry {
  id: string;
  name: string;
  family: string;
  provider: "aihorde" | "hf-space" | "pollinations";
  specialty: "coding" | "reasoning" | "fullstack" | "multimodal";
  tier: "flagship" | "mid" | "fast";
}

// 42 Trusted Open-Source Models Roster ordered strictly BEST FIRST -> high-speed backups
const OPEN_SOURCE_CODING_ROSTER: OpenSourceModelEntry[] = [
  // Flagship Open-Source Tier (>24B & Advanced Reasoning / Coding MoE)
  { id: "sonar/TheDrummer/Behemoth-128B-v3-4.25bpw-h6-exl3", name: "Mistral Large Behemoth 128B v3", family: "Mistral Large 128B", provider: "aihorde", specialty: "fullstack", tier: "flagship" },
  { id: "aphrodite/TheDrummer/Behemoth-128B-v3", name: "Behemoth 128B Aphrodite", family: "Mistral Large 128B", provider: "aihorde", specialty: "fullstack", tier: "flagship" },
  { id: "lmstudio/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive", name: "Qwen 3.6 35B-A3B MoE", family: "Qwen 3.6", provider: "aihorde", specialty: "fullstack", tier: "flagship" },
  { id: "koboldcpp/gemma-4-31B-it-heretic", name: "Google Gemma 4 31B IT", family: "Gemma 4", provider: "aihorde", specialty: "fullstack", tier: "flagship" },
  { id: "aphrodite/TheDrummer/Skyfall-31B-v4.2", name: "Skyfall 31B v4.2", family: "Gemma / Mistral 31B", provider: "aihorde", specialty: "coding", tier: "flagship" },
  { id: "koboldcpp/G4-MeroMero-26B-A4B-it-uncensored-heretic", name: "Gemma 4 26B-A4B MoE", family: "Gemma 4", provider: "aihorde", specialty: "coding", tier: "flagship" },
  { id: "koboldcpp/Cydonia-24B-v4.3-heretic-Q4_K_M", name: "Mistral Small Cydonia 24B v4.3", family: "Mistral 24B", provider: "aihorde", specialty: "coding", tier: "flagship" },
  { id: "koboldcpp/Cydonia-24B-v4zg-Q4_K_M", name: "Cydonia 24B v4zg", family: "Mistral 24B", provider: "aihorde", specialty: "coding", tier: "flagship" },
  { id: "Qwen/Qwen3.8-Flash-Next", name: "Qwen 3.8 Flash Next", family: "Qwen 3.8", provider: "aihorde", specialty: "coding", tier: "flagship" },
  { id: "Qwen/Qwen3.8-Flash-Uncensored", name: "Qwen 3.8 Flash", family: "Qwen 3.8", provider: "aihorde", specialty: "coding", tier: "flagship" },
  { id: "openai-fast", name: "GPT-OSS 20B Reasoning", family: "GPT-OSS 20B", provider: "pollinations", specialty: "reasoning", tier: "flagship" },
  { id: "Chakrasa/DeepSeek-V4-Pro-Qwen3.5-9B-heretic-demo", name: "DeepSeek-V4-Pro Qwen3.5", family: "DeepSeek / Qwen", provider: "hf-space", specialty: "reasoning", tier: "flagship" },
  { id: "huggingface-projects/gemma-3-12b-it", name: "Google Gemma 3 12B IT", family: "Gemma 3", provider: "hf-space", specialty: "coding", tier: "flagship" },
  { id: "merterbak/phi-4", name: "Microsoft Phi-4 14B", family: "Phi-4", provider: "hf-space", specialty: "reasoning", tier: "flagship" },

  // Mid Tier (9B–14B Strong Engineering & Logic)
  { id: "koboldcpp/Qwen3-14B", name: "Qwen 3 14B", family: "Qwen 3", provider: "aihorde", specialty: "coding", tier: "mid" },
  { id: "koboldcpp/Rocinante-X-12B-v1", name: "Mistral NeMo Rocinante-X 12B", family: "Mistral NeMo", provider: "aihorde", specialty: "coding", tier: "mid" },
  { id: "koboldcpp/NemoMix-Unleashed-12B-Q6_K", name: "NemoMix Unleashed 12B Q6", family: "Mistral NeMo", provider: "aihorde", specialty: "coding", tier: "mid" },
  { id: "koboldcpp/NemoMix-Unleashed-12B-Q4_K_M", name: "NemoMix Unleashed 12B Q4", family: "Mistral NeMo", provider: "aihorde", specialty: "coding", tier: "mid" },
  { id: "lmstudio/Qwen3.5-9B-Uncensored-HauhauCS-Aggressive", name: "Qwen 3.5 9B Instruct", family: "Qwen 3.5", provider: "aihorde", specialty: "coding", tier: "mid" },
  { id: "huggingface-projects/gemma-2-9b-it", name: "Google Gemma 2 9B IT", family: "Gemma 2", provider: "hf-space", specialty: "coding", tier: "mid" },
  { id: "Qwen/Qwen3-Coder-WebDev", name: "Qwen3 Coder WebDev", family: "Qwen3-Coder", provider: "hf-space", specialty: "fullstack", tier: "mid" },
  { id: "Qwen/Qwen2.5-Coder-32B-Instruct", name: "Qwen 2.5 Coder 32B Instruct", family: "Qwen 2.5 Coder", provider: "hf-space", specialty: "fullstack", tier: "mid" },
  { id: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B", name: "DeepSeek-R1 Distill Qwen 32B", family: "DeepSeek-R1", provider: "hf-space", specialty: "reasoning", tier: "mid" },
  { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek-V3 Open-Weight", family: "DeepSeek-V3", provider: "hf-space", specialty: "fullstack", tier: "mid" },
  { id: "mistralai/Codestral-22B-v0.1", name: "Mistral Codestral 22B", family: "Codestral", provider: "hf-space", specialty: "coding", tier: "mid" },
  { id: "meta-llama/Llama-3.3-70B-Instruct", name: "Meta Llama 3.3 70B Instruct", family: "Llama 3.3", provider: "hf-space", specialty: "fullstack", tier: "mid" },
  { id: "Qwen/Qwen3-235B-A22B", name: "Qwen 3 235B-A22B MoE", family: "Qwen 3", provider: "hf-space", specialty: "reasoning", tier: "mid" },
  { id: "koboldcpp/L3-8B-Stheno-v3.2-Q6_K", name: "Llama 3 8B Q6_K", family: "Llama 3", provider: "aihorde", specialty: "coding", tier: "mid" },
  { id: "koboldcpp/L3-8B-Stheno-v3.2-Q5_K_M", name: "Llama 3 8B Q5_K_M", family: "Llama 3", provider: "aihorde", specialty: "coding", tier: "mid" },
  { id: "koboldcpp/L3-8B-Stheno-v3.2", name: "Llama 3 8B Stheno v3.2", family: "Llama 3", provider: "aihorde", specialty: "coding", tier: "mid" },
  { id: "koboldcpp/Sao10K/L3-8B-Stheno-v3.2", name: "Sao10K Llama 3 8B", family: "Llama 3", provider: "aihorde", specialty: "coding", tier: "mid" },
  { id: "koboldcpp/Llama-3-Lumimaid-8B-v0.1", name: "Llama 3 8B Lumimaid", family: "Llama 3", provider: "aihorde", specialty: "coding", tier: "mid" },

  // Fast Backup Tier (Compact & Instant Responders)
  { id: "koboldcpp/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M", name: "Gemma 4 E4B", family: "Gemma 4", provider: "aihorde", specialty: "coding", tier: "fast" },
  { id: "koboldcpp/debug-gemma-4-E2B-Queen-it-qat-q4_0-unquantized.i1-Q4_K_M", name: "Gemma 4 E2B", family: "Gemma 4", provider: "aihorde", specialty: "coding", tier: "fast" },
  { id: "koboldcpp/Qwen3.5-4B-Uncensored-HauhauCS-Aggressive", name: "Qwen 3.5 4B", family: "Qwen 3.5", provider: "aihorde", specialty: "coding", tier: "fast" },
  { id: "koboldcpp/Qwen3.5-2B-Uncensored-HauhauCS-Aggressive-Q6_K", name: "Qwen 3.5 2B Q6", family: "Qwen 3.5", provider: "aihorde", specialty: "coding", tier: "fast" },
  { id: "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M", name: "Llama 3.2 3B Instruct Q4", family: "Llama 3.2", provider: "aihorde", specialty: "coding", tier: "fast" },
  { id: "koboldcpp/Llama-3.2-3B-Instruct", name: "Llama 3.2 3B Instruct", family: "Llama 3.2", provider: "aihorde", specialty: "coding", tier: "fast" },
  { id: "RWKV/RWKV7-2.9B-20260805", name: "RWKV-7 2.9B", family: "RWKV-7", provider: "aihorde", specialty: "reasoning", tier: "fast" },
  { id: "koboldcpp/Gemma-3-1B-it-GLM-4.7-Flash-Heretic-Uncensored-Thinking_Q8_0", name: "Gemma 3 + GLM-4.7 Thinking", family: "Gemma / GLM", provider: "aihorde", specialty: "reasoning", tier: "fast" },
  { id: "BlackGoku7/deepseek-ai-DeepSeek-R1-Distill-Qwen-1.5B", name: "DeepSeek-R1 Distill Qwen 1.5B", family: "DeepSeek-R1", provider: "hf-space", specialty: "reasoning", tier: "fast" },
  { id: "koboldcpp/Llama-3.2-1B-Instruct", name: "Llama 3.2 1B Instruct", family: "Llama 3.2", provider: "aihorde", specialty: "coding", tier: "fast" },
];

let pollinationsTextCooldownUntil = 0;
let hordeTextModelsCache: { at: number; models: Array<{ name: string; count: number; eta: number }> } = {
  at: 0,
  models: [],
};

async function refreshHordeTextModelsCache(): Promise<Map<string, { name: string; count: number; eta: number }>> {
  const now = Date.now();
  if (now - hordeTextModelsCache.at > 45000 || hordeTextModelsCache.models.length === 0) {
    try {
      const r = await fetch("https://aihorde.net/api/v2/status/models?type=text", {
        signal: AbortSignal.timeout(4500),
      });
      if (r.ok) {
        const list = (await r.json()) as Array<{ name: string; count?: number; eta?: number }>;
        if (Array.isArray(list)) {
          hordeTextModelsCache = {
            at: now,
            models: list
              .filter((m) => (m.count || 0) >= 1)
              .map((m) => ({
                name: m.name,
                count: Number(m.count || 0),
                eta: Number(m.eta ?? 999),
              })),
          };
        }
      }
    } catch {
      // use previous cache or roster defaults
    }
  }
  return new Map(hordeTextModelsCache.models.map((m) => [m.name, m]));
}

async function getLiveAiHordeTextModels(
  tierFilter: "flagship" | "backup" | "all" = "all"
): Promise<string[]> {
  const liveMap = await refreshHordeTextModelsCache();
  const hordeEntries = OPEN_SOURCE_CODING_ROSTER.filter((m) => m.provider === "aihorde");

  const filterByTier = (entries: OpenSourceModelEntry[], tier: "flagship" | "backup" | "all") => {
    if (tier === "flagship") return entries.filter((e) => e.tier === "flagship");
    if (tier === "backup") return entries.filter((e) => e.tier !== "flagship");
    return entries;
  };

  const selectedIds = filterByTier(hordeEntries, tierFilter).map((m) => m.id);
  const onlineInTier = selectedIds.filter((id) => {
    const stat = liveMap.get(id);
    return stat && stat.count >= 1 && stat.eta <= (tierFilter === "flagship" ? 95 : 65);
  });

  if (onlineInTier.length > 0) {
    return onlineInTier.slice(0, 8);
  }

  if (tierFilter === "flagship") {
    // Also check if online live models contain any large 20B–128B models not listed explicitly
    const largeDynamic = hordeTextModelsCache.models
      .filter((m) => m.count >= 1 && m.eta <= 110 && /\b(?:128B|70B|35B|32B|31B|27B|26B|24B|22B|Qwen3\.8)\b/i.test(m.name))
      .sort((a, b) => a.eta - b.eta || b.count - a.count)
      .map((m) => m.name);
    if (largeDynamic.length > 0) return largeDynamic.slice(0, 6);
    return [
      "koboldcpp/gemma-4-31B-it-heretic",
      "aphrodite/TheDrummer/Skyfall-31B-v4.2",
      "koboldcpp/G4-MeroMero-26B-A4B-it-uncensored-heretic",
      "Qwen/Qwen3.8-Flash-Uncensored",
      "koboldcpp/Cydonia-24B-v4.3-heretic-Q4_K_M",
    ];
  }

  const anyOnline = hordeTextModelsCache.models
    .filter((m) => m.count >= 1 && m.eta <= 60)
    .sort((a, b) => a.eta - b.eta || b.count - a.count)
    .map((m) => m.name);
  if (anyOnline.length > 0) {
    return anyOnline.slice(0, 8);
  }
  return [
    "koboldcpp/Qwen3-14B",
    "koboldcpp/Rocinante-X-12B-v1",
    "koboldcpp/NemoMix-Unleashed-12B-Q6_K",
    "koboldcpp/L3-8B-Stheno-v3.2",
    "koboldcpp/Llama-3.2-3B-Instruct-Q4_K_M",
  ];
}

async function callPollinationsTextFallback(
  messages: IncomingMessage[],
  systemInstruction: string,
  timeoutMs = 20000
): Promise<string> {
  if (Date.now() < pollinationsTextCooldownUntil) {
    throw new Error("Pollinations text cooldown active");
  }
  const formattedMessages = [
    { role: "system", content: systemInstruction },
    ...messages.slice(-10).map((m) => {
      let body = m.content;
      if (m.attachments?.length) {
        const attNotes = m.attachments
          .map((a) =>
            a.extractedText
              ? `\n[File: ${a.name}]\n${a.extractedText.slice(0, 12000)}`
              : `[Attached ${a.kind}: ${a.name}]`
          )
          .join("\n");
        body = `${attNotes}\n\n${body}`;
      }
      return { role: m.role, content: body };
    }),
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai-fast",
        messages: formattedMessages,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 402 || res.status === 429) {
        const retryHdr = Number(res.headers.get("retry-after"));
        const sec = Number.isFinite(retryHdr) && retryHdr > 0 ? Math.min(45, retryHdr) : 20;
        pollinationsTextCooldownUntil = Date.now() + sec * 1000;
      }
      throw new Error(`Pollinations text API returned ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("Empty response from open-weight text provider");
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAiHordeTextPool(
  messages: IncomingMessage[],
  systemInstruction: string,
  maxWaitMs = 18000,
  tierFilter: "flagship" | "backup" | "all" = "flagship"
): Promise<{ text: string; model: string }> {
  const models = await getLiveAiHordeTextModels(tierFilter);
  const recentTurns = messages.slice(-6).map((m) => {
    let body = m.content;
    if (m.attachments?.length) {
      const attNotes = m.attachments
        .map((a) =>
          a.extractedText
            ? `\n[File: ${a.name}]\n${a.extractedText.slice(0, 6000)}`
            : `[Attached ${a.kind}: ${a.name}]`
        )
        .join("\n");
      body = `${attNotes}\n${body}`;
    }
    return `<|im_start|>${m.role}\n${body}<|im_end|>`;
  });
  const prompt = `<|im_start|>system\n${systemInstruction.slice(0, 2000)}<|im_end|>\n${recentTurns.join("\n")}\n<|im_start|>assistant\n`;

  const submitHorde = async (maxLen: number, maxCtx: number) =>
    fetch("https://aihorde.net/api/v2/generate/text/async", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: "0000000000",
        "Client-Agent": "KestrelAI:1.0:support@kestrel.ai",
      },
      body: JSON.stringify({
        prompt,
        params: {
          max_length: maxLen,
          max_context_length: maxCtx,
          temperature: 0.2,
          top_p: 0.92,
          stop_sequence: ["<|im_end|>", "<|endoftext|>", "<end_of_turn>", "<|eot_id|>"],
        },
        models,
      }),
      signal: AbortSignal.timeout(6500),
    });

  let subRes = await submitHorde(3072, 6144);
  if (subRes.status === 400) {
    subRes = await submitHorde(1800, 4096);
  }
  if (!subRes.ok) {
    throw new Error(`Horde text HTTP ${subRes.status}`);
  }
  const subJson = (await subRes.json()) as { id?: string };
  if (!subJson.id) {
    throw new Error("Horde text missing id");
  }

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const stRes = await fetch(
      `https://aihorde.net/api/v2/generate/text/status/${subJson.id}`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!stRes.ok) continue;
    const st = (await stRes.json()) as {
      done?: boolean;
      faulted?: boolean;
      generations?: Array<{ text?: string; model?: string }>;
    };
    if (st.faulted) throw new Error("Horde worker faulted");
    if (st.done && st.generations?.[0]?.text) {
      const cleaned = st.generations[0].text
        .replace(/<\|im_end\|>[\s\S]*$/g, "")
        .replace(/<end_of_turn>[\s\S]*$/g, "")
        .replace(/<\|eot_id\|>[\s\S]*$/g, "")
        .replace(/<\/s>[\s\S]*$/g, "")
        .trim();
      if (cleaned.length > 0) {
        return {
          text: cleaned,
          model: st.generations[0].model || "Open-Source LLM Pool",
        };
      }
      throw new Error("Horde text returned empty output");
    }
  }
  throw new Error("Horde text wait exceeded");
}

async function callHfCodingSpaceFallback(
  messages: IncomingMessage[],
  systemInstruction: string
): Promise<{ text: string; model: string } | null> {
  const latestUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  if (!latestUser.trim()) return null;
  const promptText = `${systemInstruction.slice(0, 1200)}\n\nUser request:\n${latestUser}`;

  // Ranked strictly BEST first -> compact backup
  const candidates = [
    {
      name: "DeepSeek-V4-Pro Qwen3.5",
      url: "https://chakrasa-deepseek-v4-pro-qwen3-5-9b-heretic-demo.hf.space",
      ep: "chat",
      data: [promptText, [], false],
    },
    {
      name: "Google Gemma 3 12B IT",
      url: "https://huggingface-projects-gemma-3-12b-it.hf.space",
      ep: "run",
      data: [{ text: latestUser, files: [] }, systemInstruction.slice(0, 1200), 1400],
    },
    {
      name: "Google Gemma 2 9B IT",
      url: "https://huggingface-projects-gemma-2-9b-it.hf.space",
      ep: "generate",
      data: [promptText, 1200, 0.2],
    },
    {
      name: "DeepSeek-R1 Distill Qwen",
      url: "https://blackgoku7-deepseek-ai-deepseek-r1-distill-qwen-1-5b.hf.space",
      ep: "chat",
      data: [promptText],
    },
  ];

  // Try sequentially by best-first quality (max 11s per tier)
  for (const c of candidates) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 11000);
    try {
      const pRes = await fetch(`${c.url}/gradio_api/call/${c.ep}`, {
        method: "POST",
        headers: getHfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ data: c.data }),
        signal: ctrl.signal,
      });
      if (!pRes.ok) continue;
      const pj = (await pRes.json()) as { event_id?: string };
      if (!pj.event_id) continue;
      const sRes = await fetch(`${c.url}/gradio_api/call/${c.ep}/${pj.event_id}`, {
        headers: getHfHeaders(),
        signal: ctrl.signal,
      });
      if (!sRes.ok) continue;
      const sse = await sRes.text();
      if (/event:\s*error/i.test(sse)) continue;
      const match = sse.match(/event:\s*complete[\r\n]+data:\s*(.+)/);
      if (!match) continue;
      const arr = JSON.parse(match[1]) as unknown[];
      const firstStr = arr.find((x) => typeof x === "string" && x.trim().length > 10) as
        | string
        | undefined;
      if (firstStr) {
        return { text: firstStr.trim(), model: c.name };
      }
    } catch {
      // move cleanly to next backup model
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

function getDimensionsForAspectRatio(ratio: string): { width: number; height: number } {
  switch (ratio) {
    case "16:9":
      return { width: 960, height: 540 };
    case "9:16":
      return { width: 540, height: 960 };
    case "4:3":
      return { width: 800, height: 600 };
    case "3:4":
      return { width: 600, height: 800 };
    case "1:1":
    default:
      return { width: 768, height: 768 };
  }
}

function getVideoDimensions(ratio?: string): {
  aspectRatio: "16:9" | "9:16" | "1:1";
  width: number;
  height: number;
} {
  if (ratio === "9:16") return { aspectRatio: "9:16", width: 544, height: 960 };
  if (ratio === "1:1") return { aspectRatio: "1:1", width: 640, height: 640 };
  return { aspectRatio: "16:9", width: 960, height: 544 };
}

function hashPrompt(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function buildProceduralSvgFallback(
  prompt: string,
  width: number,
  height: number
): string {
  const seed = hashPrompt(prompt);
  const lower = prompt.toLowerCase();
  let pal = ["#0F172A", "#1E3A8A", "#3B82F6", "#93C5FD", "#E0F2FE"];
  if (/sunset|fire|mars|red|warm|autumn|orange|gold/.test(lower)) {
    pal = ["#1A0B1C", "#7C2D12", "#EA580C", "#FB923C", "#FEF3C7"];
  } else if (/forest|nature|tree|green|jungle|meadow/.test(lower)) {
    pal = ["#052E16", "#14532D", "#16A34A", "#4ADE80", "#DCFCE7"];
  } else if (/ocean|sea|water|blue|sky|ice|winter/.test(lower)) {
    pal = ["#082F49", "#0369A1", "#0EA5E9", "#7DD3FC", "#F0F9FF"];
  } else if (/night|space|galaxy|cyber|neon|dark/.test(lower)) {
    pal = ["#090D16", "#1E1B4B", "#4F46E5", "#38BDF8", "#E0E7FF"];
  }

  const sunX = width * (0.28 + ((seed % 44) / 100));
  const sunY = height * (0.24 + (((seed >> 4) % 24) / 100));
  const sunR = Math.min(width, height) * 0.14;

  const hills = Array.from({ length: 4 }, (_, idx) => {
    const yBase = height * (0.52 + idx * 0.11);
    const amp = 28 + ((seed + idx * 19) % 40);
    const shift = ((seed >> idx) % 30) / 100;
    const color = pal[Math.min(pal.length - 1, idx + 1)];
    return `<path d="M 0 ${yBase} Q ${width * (0.25 + shift * 0.2)} ${yBase - amp} ${width * 0.5} ${yBase + amp * 0.3} T ${width} ${yBase} L ${width} ${height} L 0 ${height} Z" fill="${color}" fill-opacity="${(0.28 + idx * 0.16).toFixed(2)}" />`;
  }).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${pal[0]}" />
      <stop offset="65%" stop-color="${pal[1]}" />
      <stop offset="100%" stop-color="${pal[2]}" />
    </linearGradient>
    <radialGradient id="orb" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${pal[4]}" stop-opacity="0.95" />
      <stop offset="55%" stop-color="${pal[3]}" stop-opacity="0.45" />
      <stop offset="100%" stop-color="${pal[2]}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#sky)" />
  <circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="${(sunR * 2.1).toFixed(1)}" fill="url(#orb)" />
  <circle cx="${sunX.toFixed(1)}" cy="${sunY.toFixed(1)}" r="${(sunR * 0.72).toFixed(1)}" fill="${pal[4]}" fill-opacity="0.9" />
  ${hills}
</svg>`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // Health check
  app.get("/api/health", (_req, res) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
    );
    res.json({
      ok: true,
      freeTierReady: true,
      geminiConfigured: hasKey,
      openSourceCodingModelsCount: OPEN_SOURCE_CODING_ROSTER.length,
    });
  });

  // Live Open-Source Models Registry (26+ coding & multi-modal models)
  app.get("/api/models", async (_req, res) => {
    const liveHorde = await getLiveAiHordeTextModels();
    res.json({
      totalCodingModels: OPEN_SOURCE_CODING_ROSTER.length,
      liveHordeWorkers: liveHorde,
      models: OPEN_SOURCE_CODING_ROSTER,
    });
  });

  // Document & file extraction endpoint (DOCX, PDF fallback text, text files)
  app.post("/api/parse-file", async (req, res) => {
    try {
      const { name, mimeType, base64 } = req.body as {
        name?: string;
        mimeType?: string;
        base64?: string;
      };
      if (!name || !base64) {
        res.status(400).json({ error: "Missing file name or data." });
        return;
      }

      const buffer = Buffer.from(base64, "base64");
      const lower = name.toLowerCase();

      if (
        lower.endsWith(".docx") ||
        mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const text = extractDocxText(buffer);
        res.json({
          extractedText: text || "[DOCX contained no readable text paragraphs]",
          kind: "docx",
        });
        return;
      }

      if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
        let extractedText = "";
        try {
          const pdfOut = await extractPdfViaPdfJs(new Uint8Array(buffer), {
            mergePages: true,
          });
          extractedText = (pdfOut?.text || "").trim().slice(0, 80000);
        } catch {
          extractedText = "";
        }
        if (!extractedText || extractedText.length < 24) {
          extractedText = extractPdfTextFallback(buffer);
        }
        res.json({
          extractedText:
            extractedText ||
            "[PDF binary attached for multimodal inspection; text layer was scanned or empty]",
          kind: "pdf",
        });
        return;
      }

      const text = buffer.toString("utf8").slice(0, 100000);
      res.json({ extractedText: text, kind: "text" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to parse file";
      res.status(500).json({ error: msg });
    }
  });

  // Multi-tier streaming chat + code + vision + document endpoint
  app.post("/api/chat", async (req, res) => {
    const body = req.body as ChatRequestBody;
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const mode = body?.mode || "chat";
    const thinkingLevel = body?.thinkingLevel || (mode === "code" ? "XHIGH" : "HIGH");
    const useWebSearch = Boolean(body?.useWebSearch);

    if (messages.length === 0) {
      res.status(400).json({ error: "No messages provided." });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    const systemInstruction = buildSystemInstruction(mode);
    const ai = getGeminiClient();
    const fallbackPath: string[] = [];
    let succeeded = false;
    let lastErrorMessage = "";
    let keyErrorDetected = false;

    const latestUserText =
      [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const detectedUrls = useWebSearch ? extractUrls(latestUserText) : [];

    const tryGeminiStream = async (options: {
      model: string;
      label: string;
      thinking?: ThinkingLevel;
      enableSearch?: boolean;
      includeBinary?: boolean;
      timeoutMs?: number;
    }): Promise<boolean> => {
      if (!ai) {
        fallbackPath.push(`${options.label} skipped`);
        return false;
      }

      const timeoutMs = options.timeoutMs ?? 20000;
      const heartbeat = setInterval(() => {
        sendEvent({
          type: "status",
          stage:
            options.thinking === ThinkingLevel.XHIGH
              ? "Deep reasoning..."
              : "Thinking...",
        });
      }, 2400);

      try {
        const contents = buildGeminiContents(messages, options.includeBinary ?? true);
        const tools: Array<Record<string, unknown>> = [];
        if (options.enableSearch) {
          tools.push({ googleSearch: {} });
          if (detectedUrls.length > 0) {
            tools.push({ urlContext: {} });
          }
        }

        const config: Record<string, unknown> = {
          systemInstruction,
        };
        if (options.thinking && options.model === "gemini-4-hydrogen") {
          config.thinkingConfig = { thinkingLevel: options.thinking };
        }
        if (tools.length > 0) {
          config.tools = tools;
        }

        const streamPromise = ai.models.generateContentStream({
          model: options.model,
          contents,
          config,
        });
        const openTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
        );
        const stream = await Promise.race([streamPromise, openTimeout]);

        let emittedAnyText = false;
        const collectedSources = new Map<string, string>();
        const iter = stream[Symbol.asyncIterator]();

        while (true) {
          const stepPromise = iter.next();
          const stepTimeoutMs = !emittedAnyText ? timeoutMs : 20000;
          const chunkTimeout = new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Stream chunk timed out after ${stepTimeoutMs}ms`)),
              stepTimeoutMs
            )
          );
          const step = await Promise.race([stepPromise, chunkTimeout]);

          if (step.done) break;
          const c = step.value as GenerateContentResponse;
          const text = c.text;
          if (text) {
            if (!emittedAnyText) {
              clearInterval(heartbeat);
            }
            emittedAnyText = true;
            sendEvent({ type: "delta", text });
          }

          const gChunks = c.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (Array.isArray(gChunks)) {
            for (const gc of gChunks) {
              const uri = gc?.web?.uri;
              const title = gc?.web?.title || uri;
              if (uri && title) {
                collectedSources.set(uri, title);
              }
            }
          }
        }

        if (!emittedAnyText) {
          fallbackPath.push(`${options.label} empty stream`);
          return false;
        }

        const groundingSources = Array.from(collectedSources.entries()).map(
          ([url, title]) => ({ url, title })
        );

        sendEvent({
          type: "meta",
          engineUsed: options.label,
          fallbackPath,
          groundingSources,
        });
        return true;
      } catch (err) {
        const info = classifyGeminiError(err);
        lastErrorMessage = info.message;
        if (info.isKeyError) {
          keyErrorDetected = true;
        }
        fallbackPath.push(`${options.label} (${info.status}): ${info.message.slice(0, 70)}`);
        return false;
      } finally {
        clearInterval(heartbeat);
      }
    };

    const tier1FirstTokenTimeout = mode === "code" ? 7000 : 6500;

    // Tier 1 (BEST FIRST): Gemini 4 Hydrogen Deep Reasoning (fast first-token probe + 15m cooldown on stall so UX stays snappy)
    if (Date.now() >= gemini4CooldownUntil) {
      succeeded = await tryGeminiStream({
        model: "gemini-4-hydrogen",
        label: `Gemini 4 Hydrogen (${thinkingLevel})`,
        thinking: mapThinkingLevel(thinkingLevel),
        enableSearch: useWebSearch,
        includeBinary: true,
        timeoutMs: tier1FirstTokenTimeout,
      });
      if (!succeeded && !keyErrorDetected) {
        gemini4CooldownUntil = Date.now() + 15 * 60 * 1000;
      }
    } else {
      fallbackPath.push("Gemini 4 Hydrogen fast bypass active");
    }

    // Tier 2: Gemini 3.1 Flash Lite (Free high-speed flagship backup)
    if (!succeeded && !keyErrorDetected) {
      succeeded = await tryGeminiStream({
        model: "gemini-3.1-flash-lite",
        label: "Gemini 3.1 Flash Lite",
        enableSearch: useWebSearch,
        includeBinary: true,
        timeoutMs: 24000,
      });
    }

    // Tier 3: Gemini 3.1 Flash Lite with extracted text-only fallback if binary payload failed
    if (!succeeded && !keyErrorDetected) {
      const hasBinary = messages.some((m) =>
        m.attachments?.some((a) => a.kind === "pdf" || a.kind === "image")
      );
      if (hasBinary) {
        succeeded = await tryGeminiStream({
          model: "gemini-3.1-flash-lite",
          label: "Gemini 3.1 Flash Lite (Document Text)",
          enableSearch: false,
          includeBinary: false,
          timeoutMs: 16000,
        });
      }
    }

    // Tier 4: Flagship Open-Source >24B Cluster FIRST (Behemoth 128B, Gemma 4 31B, Skyfall 31B, Qwen 3.6 35B, Qwen 3.8, Cydonia 24B)
    if (!succeeded) {
      try {
        sendEvent({ type: "status", stage: mode === "code" ? "Engineering solution..." : "Thinking..." });
        const flagshipHorde = await callAiHordeTextPool(messages, systemInstruction, 15000, "flagship");
        sendEvent({ type: "delta", text: flagshipHorde.text });
        sendEvent({
          type: "meta",
          engineUsed: flagshipHorde.model,
          fallbackPath,
          groundingSources: [],
        });
        succeeded = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fallbackPath.push(`Open-Source Flagship Pool (${msg})`);
      }
    }

    // Tier 5: Open-Weight GPT-OSS 20B Reasoning (Pollinations OpenAI-Compatible)
    if (!succeeded) {
      try {
        const text = await callPollinationsTextFallback(
          messages,
          systemInstruction
        );
        sendEvent({ type: "delta", text });
        sendEvent({
          type: "meta",
          engineUsed: "GPT-OSS 20B (Open-Weight)",
          fallbackPath,
          groundingSources: [],
        });
        succeeded = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fallbackPath.push(`Pollinations failed (${msg})`);
      }
    }

    // Tier 6: HuggingFace Flagship Coding & Reasoning Spaces (DeepSeek-V4-Pro, Gemma 3 12B, Gemma 2 9B, DeepSeek-R1)
    if (!succeeded) {
      const hfOut = await callHfCodingSpaceFallback(messages, systemInstruction);
      if (hfOut) {
        sendEvent({ type: "delta", text: hfOut.text });
        sendEvent({
          type: "meta",
          engineUsed: hfOut.model,
          fallbackPath,
          groundingSources: [],
        });
        succeeded = true;
      }
    }

    // Tier 7: High-Speed Mid/Compact Open-Source Backup Pool (Qwen3 14B, Rocinante 12B, NemoMix 12B, Llama 3 8B)
    if (!succeeded) {
      try {
        const backupHorde = await callAiHordeTextPool(messages, systemInstruction, 15000, "backup");
        sendEvent({ type: "delta", text: backupHorde.text });
        sendEvent({
          type: "meta",
          engineUsed: backupHorde.model,
          fallbackPath,
          groundingSources: [],
        });
        succeeded = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fallbackPath.push(`Open-Source Backup Pool (${msg})`);
      }
    }

    if (!succeeded) {
      const guidance = keyErrorDetected
        ? "Your Gemini API key could not be verified. Check Settings > Secrets or retry in a moment."
        : !ai
          ? "Ready whenever you would like to retry."
          : `All inference tiers are busy (${lastErrorMessage.slice(0, 60)}). Please retry.`;

      sendEvent({
        type: "error",
        message: guidance,
        fallbackPath,
      });
    }

    sendEvent({ type: "done" });
    res.end();
  });

  // Cooldown tracking for HF Spaces, Pollinations & Gemini-4
  let gemini4CooldownUntil = 0;
  let serverZeroGpuImageBlockedUntil = 0;
  let serverZeroGpuVideoBlockedUntil = 0;
  let hfFluxMergedCooldownUntil = 0;
  let hfFlux2CooldownUntil = 0;
  let hfQwen21CooldownUntil = 0;
  let hfKreaCooldownUntil = 0;
  let hfZImageCooldownUntil = 0;
  let hfFluxCooldownUntil = 0;
  let hfSanaSprintCooldownUntil = 0;
  let pollinationsCooldownUntil = 0;
  let aiHordeLock: Promise<unknown> = Promise.resolve();

  function mapZImageResolution(ratio: string): string {
    switch (ratio) {
      case "16:9":
        return "1280x720 ( 16:9 )";
      case "9:16":
        return "720x1280 ( 9:16 )";
      case "4:3":
        return "1152x864 ( 4:3 )";
      case "3:4":
        return "864x1152 ( 3:4 )";
      case "1:1":
      default:
        return "1024x1024 ( 1:1 )";
    }
  }

  function mapQwenAspectRatio(ratio: string): string {
    const allowed = new Set(["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16"]);
    return allowed.has(ratio) ? ratio : "1:1";
  }

  let hfFluxDevCooldownUntil = 0;
  let hfSd35CooldownUntil = 0;
  let hfQwenImageCooldownUntil = 0;

  function extractGradioImageUrl(parsed: unknown, spaceUrl?: string): string | null {
    const queue: unknown[] = [parsed];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (!cur || typeof cur !== "object") continue;
      if (Array.isArray(cur)) {
        queue.push(...cur);
        continue;
      }
      const obj = cur as Record<string, unknown>;
      if (
        typeof obj.url === "string" &&
        obj.url.startsWith("http") &&
        !/\.(mp4|webm|mov)(\?|$)/i.test(obj.url)
      ) {
        return obj.url;
      }
      if (typeof obj.path === "string" && spaceUrl && !/\.(mp4|webm|mov)(\?|$)/i.test(obj.path)) {
        return `${spaceUrl}/gradio_api/file=${obj.path}`;
      }
      if (obj.image && typeof obj.image === "object") {
        const im = obj.image as Record<string, unknown>;
        if (typeof im.url === "string" && im.url.startsWith("http")) return im.url;
        if (typeof im.path === "string" && spaceUrl) return `${spaceUrl}/gradio_api/file=${im.path}`;
      }
    }
    return null;
  }

  async function cropBottomWatermarkServer(
    buf: Buffer,
    cropFraction = 0.12
  ): Promise<{ dataUrl: string; mimeType: string }> {
    const meta = await sharp(buf).metadata();
    const w = meta.width || 1024;
    const h = meta.height || 1024;
    const croppedH = Math.max(64, Math.round(h * (1 - cropFraction)));
    const outBuf = await sharp(buf)
      .extract({ left: 0, top: 0, width: w, height: croppedH })
      .jpeg({ quality: 92 })
      .toBuffer();
    return {
      dataUrl: `data:image/jpeg;base64,${outBuf.toString("base64")}`,
      mimeType: "image/jpeg",
    };
  }

  async function callServerPollinationsCropped(
    prompt: string,
    width: number,
    height: number,
    modelsToTry: string[],
    fallbackPath?: string[]
  ): Promise<{ dataUrl: string; mimeType: string; engine: string; remoteUrl?: string } | null> {
    if (Date.now() < pollinationsCooldownUntil) {
      fallbackPath?.push("Server Pollinations IP in 402 cooldown");
      return null;
    }

    const fetchHeight = Math.min(1408, Math.round(height / 0.92 / 8) * 8);
    const fetchWidth = Math.min(1408, Math.round(width / 8) * 8);
    let maxWaitSec402 = 0;
    let non402Attempted = false;

    for (const model of modelsToTry) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 14000);
      const seed = hashPrompt(`${prompt}_${model}_${Date.now()}`);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${fetchWidth}&height=${fetchHeight}&model=${model}&nologo=true&seed=${seed}`;
      try {
        const resp = await fetch(url, { signal: controller.signal });
        if (!resp.ok) {
          if (resp.status === 402) {
            const hdrRetry = Number(resp.headers.get("retry-after"));
            let bodyRetry = 25;
            try {
              const errBody = await resp.text();
              const m = errBody.match(/retry after\s+(\d+)\s*s/i);
              if (m) bodyRetry = Number(m[1]);
            } catch {
              // ignore
            }
            const waitSec =
              Number.isFinite(hdrRetry) && hdrRetry > 0
                ? hdrRetry
                : Number.isFinite(bodyRetry) && bodyRetry > 0
                  ? bodyRetry
                  : 25;
            maxWaitSec402 = Math.max(maxWaitSec402, waitSec);
            fallbackPath?.push(`Server ${model} HTTP 402 (cooldown ${waitSec}s)`);
            continue;
          }
          non402Attempted = true;
          fallbackPath?.push(`Server ${model} HTTP ${resp.status}`);
          continue;
        }
        non402Attempted = true;
        const ctype = resp.headers.get("content-type") || "";
        if (!ctype.startsWith("image/")) {
          fallbackPath?.push(`Server ${model} non-image response`);
          continue;
        }
        const rawBuf = Buffer.from(await resp.arrayBuffer());
        if (rawBuf.length < 2500) {
          fallbackPath?.push(`Server ${model} tiny payload`);
          continue;
        }
        const cropped = await cropBottomWatermarkServer(rawBuf, 0.07);
        const labelMap: Record<string, string> = {
          flux: "FLUX.1 Server (Open-Source Flagship)",
          "flux-realism": "FLUX-Realism (Open-Source)",
        };
        return {
          dataUrl: cropped.dataUrl,
          mimeType: cropped.mimeType,
          engine: labelMap[model] || `${model} (Open-Source)`,
          remoteUrl: url,
        };
      } catch (err) {
        non402Attempted = true;
        const msg = err instanceof Error ? err.message : "timeout";
        fallbackPath?.push(`Server ${model} failed (${msg})`);
      } finally {
        clearTimeout(timer);
      }
    }
    if (!non402Attempted && maxWaitSec402 > 0) {
      pollinationsCooldownUntil = Date.now() + Math.min(18, Math.max(4, maxWaitSec402 + 1)) * 1000;
    }
    return null;
  }

  let hordeImageModelsCache: {
    at: number;
    models: Array<{ name: string; count: number; eta: number }>;
  } = { at: 0, models: [] };

  async function getTieredPhotorealisticHordeModels(
    tier: "flagship" | "backup" = "flagship"
  ): Promise<string[]> {
    const now = Date.now();
    if (now - hordeImageModelsCache.at > 45000 || hordeImageModelsCache.models.length === 0) {
      try {
        const r = await fetch("https://aihorde.net/api/v2/status/models?type=image", {
          signal: AbortSignal.timeout(4500),
        });
        if (r.ok) {
          const list = (await r.json()) as Array<{ name: string; count?: number; eta?: number }>;
          if (Array.isArray(list)) {
            hordeImageModelsCache = {
              at: now,
              models: list
                .filter((m) => (m.count || 0) >= 1)
                .map((m) => ({
                  name: m.name,
                  count: Number(m.count || 0),
                  eta: Number(m.eta ?? 999),
                })),
            };
          }
        }
      } catch {
        // use prior cache
      }
    }

    // Best-first XL / photorealistic models that succeed cleanly within free anonymous <=5 kudos budget
    const flagshipPool = [
      "SDXL 1.0",
      "AlbedoBase XL 3.1",
      "AlbedoBase XL (SDXL)",
      "DreamShaper XL",
      "Juggernaut XL",
      "RealVisXL",
      "ZavyChromaXL",
      "AAM XL",
      "Flux.1-Schnell fp8 (Compact)",
      "Z-Image-Turbo",
    ];
    const fastBackupPool = [
      "Deliberate 3.0",
      "ICBINP - I Can't Believe It's Not Photography",
      "AbsoluteReality",
      "Realistic Vision",
      "majicMIX realistic",
      "Edge Of Realism",
      "Deliberate",
      "Dreamshaper",
      "Analog Madness",
      "Epic Diffusion",
    ];
    const statMap = new Map(hordeImageModelsCache.models.map((m) => [m.name, m]));
    const selectedPool = tier === "flagship" ? flagshipPool : fastBackupPool;
    const maxEta = tier === "flagship" ? 45 : 25;

    const online = selectedPool
      .filter((name) => {
        const s = statMap.get(name);
        return s && s.count >= 1 && s.eta <= maxEta;
      })
      .sort((a, b) => (statMap.get(a)?.eta ?? 99) - (statMap.get(b)?.eta ?? 99));

    if (online.length > 0) {
      return online.slice(0, 6);
    }
    if (tier === "flagship") {
      return ["SDXL 1.0", "DreamShaper XL", "AlbedoBase XL 3.1", "Deliberate 3.0"];
    }
    return [
      "Deliberate 3.0",
      "ICBINP - I Can't Believe It's Not Photography",
      "AbsoluteReality",
      "Realistic Vision",
      "Dreamshaper",
    ];
  }

  async function callAiHordeImageBatchOnce(
    prompt: string,
    width: number,
    height: number,
    count = 1,
    fallbackPath?: string[],
    maxWaitMs = 20000,
    tier: "flagship" | "backup" = "flagship"
  ): Promise<Array<{ dataUrl: string; mimeType: string; engine: string }>> {
    // Respect AI Horde rate limit (max 2 requests/sec) and strictly stay under <= 5.0 free anonymous kudos cap
    await new Promise((r) => setTimeout(r, 650));

    let hordeW = 512;
    let hordeH = 512;
    const ratio = width / Math.max(1, height);
    if (ratio >= 1.25) {
      hordeW = 576;
      hordeH = 384;
    } else if (ratio <= 0.8) {
      hordeW = 384;
      hordeH = 576;
    }

    const chosenModels = await getTieredPhotorealisticHordeModels(tier);
    const hasXl = chosenModels.some((m) => /xl|flux|z-image/i.test(m));
    // Empirically verified: 512x512/576x384 at steps=8 (XL) or steps=12..14 (SD1.5) costs 4.0-5.0 kudos (always HTTP 202 free!)
    const safeSteps = hasXl ? 8 : count > 1 ? 12 : 14;
    const safeN = hasXl ? 1 : Math.min(3, Math.max(1, count));

    const isStylized = /\b(?:anime|cartoon|illustration|vector|pixel|manga|chibi|2d|stylized|3d render|concept art)\b/i.test(
      prompt
    );
    const negPrompt = isStylized
      ? "blurry, low quality, distorted, deformed, watermark, text, signature"
      : "blurry, low quality, cartoon, anime, illustration, distorted, deformed, watermark, text, signature";
    const hordePrompt = prompt.includes("###") ? prompt : `${prompt} ### ${negPrompt}`;

    const submitCtrl = new AbortController();
    const submitTimer = setTimeout(() => submitCtrl.abort(), 7000);
    try {
      const submitRes = await fetch("https://aihorde.net/api/v2/generate/async", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: "0000000000",
          "Client-Agent": "KestrelAI:1.0:support@kestrel.ai",
        },
        body: JSON.stringify({
          prompt: hordePrompt,
          params: {
            width: hordeW,
            height: hordeH,
            steps: safeSteps,
            cfg_scale: hasXl ? 5.5 : 6.5,
            n: safeN,
          },
          models: chosenModels,
          nsfw: false,
          censor_nsfw: true,
        }),
        signal: submitCtrl.signal,
      });
      clearTimeout(submitTimer);

      if (!submitRes.ok) {
        fallbackPath?.push(`AI Horde submit HTTP ${submitRes.status}`);
        return [];
      }
      const submitJson = (await submitRes.json()) as { id?: string };
      if (!submitJson.id) {
        fallbackPath?.push("AI Horde missing job id");
        return [];
      }

      const deadline = Date.now() + maxWaitMs;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1100));
        const stRes = await fetch(
          `https://aihorde.net/api/v2/generate/status/${submitJson.id}`,
          { signal: AbortSignal.timeout(4500) }
        );
        if (!stRes.ok) continue;
        const st = (await stRes.json()) as {
          done?: boolean;
          faulted?: boolean;
          generations?: Array<{ img?: string; model?: string }>;
        };
        if (st.faulted) {
          fallbackPath?.push("AI Horde worker faulted");
          return [];
        }
        if (st.done && Array.isArray(st.generations) && st.generations.length > 0) {
          const decoded = await Promise.all(
            st.generations.map(async (gen) => {
              const imgStr = gen.img;
              if (!imgStr) return null;
              let imgBuf: Buffer | null = null;
              let mimeType = "image/jpeg";
              try {
                if (imgStr.startsWith("http")) {
                  const imgRes = await fetch(imgStr, { signal: AbortSignal.timeout(7000) });
                  if (!imgRes.ok) return null;
                  imgBuf = Buffer.from(await imgRes.arrayBuffer());
                } else {
                  imgBuf = Buffer.from(imgStr, "base64");
                }
                if (!imgBuf || imgBuf.length < 2000) return null;
                const targetW = Math.min(1280, Math.max(hordeW, Math.round(width)));
                const targetH = Math.min(1280, Math.max(hordeH, Math.round(height)));
                imgBuf = await sharp(imgBuf)
                  .resize(targetW, targetH, { kernel: "lanczos3", fit: "cover" })
                  .sharpen({ sigma: 0.65 })
                  .jpeg({ quality: 92 })
                  .toBuffer();
                return {
                  dataUrl: `data:${mimeType};base64,${imgBuf.toString("base64")}`,
                  mimeType,
                  engine: `${gen.model || "SDXL"} · AI Horde (Open-Source)`,
                };
              } catch {
                return null;
              }
            })
          );
          return decoded.filter(
            (x): x is { dataUrl: string; mimeType: string; engine: string } => x !== null
          );
        }
      }
      fallbackPath?.push("AI Horde queue wait exceeded");
      return [];
    } catch (err) {
      clearTimeout(submitTimer);
      const msg = err instanceof Error ? err.message : "timeout";
      fallbackPath?.push(`AI Horde failed (${msg})`);
      return [];
    }
  }

  function callAiHordeImageBatch(
    prompt: string,
    width: number,
    height: number,
    count = 1,
    fallbackPath?: string[],
    maxWaitMs = 20000,
    tier: "flagship" | "backup" = "flagship"
  ): Promise<Array<{ dataUrl: string; mimeType: string; engine: string }>> {
    const run = aiHordeLock.then(
      () => callAiHordeImageBatchOnce(prompt, width, height, count, fallbackPath, maxWaitMs, tier),
      () => callAiHordeImageBatchOnce(prompt, width, height, count, fallbackPath, maxWaitMs, tier)
    );
    aiHordeLock = run.catch(() => []);
    return run;
  }

  async function callAiHordeImage(
    prompt: string,
    width: number,
    height: number,
    fallbackPath?: string[],
    maxWaitMs = 22000
  ): Promise<{ dataUrl: string; mimeType: string; engine: string } | null> {
    const flagship = await callAiHordeImageBatch(prompt, width, height, 1, fallbackPath, Math.round(maxWaitMs * 0.55), "flagship");
    if (flagship[0]) return flagship[0];
    const backup = await callAiHordeImageBatch(prompt, width, height, 1, fallbackPath, Math.round(maxWaitMs * 0.6), "backup");
    return backup[0] || null;
  }

  async function callHfImageGradioSpace(options: {
    spaceUrl: string;
    endpoint: string;
    data: unknown[];
    engineName: string;
    timeoutMs: number;
    onQuotaHit?: () => void;
    fallbackPath?: string[];
  }): Promise<{
    dataUrl: string;
    mimeType: string;
    engine: string;
    remoteUrl: string;
    quotaHit: boolean;
  } | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const postRes = await fetch(
        `${options.spaceUrl}/gradio_api/call/${options.endpoint}`,
        {
          method: "POST",
          headers: getHfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ data: options.data }),
          signal: controller.signal,
        }
      );
      if (!postRes.ok) {
        if (postRes.status === 429) {
          options.onQuotaHit?.();
        }
        options.fallbackPath?.push(`${options.engineName} POST HTTP ${postRes.status}`);
        return null;
      }
      const postJson = (await postRes.json()) as { event_id?: string };
      if (!postJson.event_id) {
        options.fallbackPath?.push(`${options.engineName} missing event_id`);
        return null;
      }

      const sseRes = await fetch(
        `${options.spaceUrl}/gradio_api/call/${options.endpoint}/${postJson.event_id}`,
        { headers: getHfHeaders(), signal: controller.signal }
      );
      if (!sseRes.ok) {
        options.fallbackPath?.push(`${options.engineName} SSE HTTP ${sseRes.status}`);
        return null;
      }
      const sseText = await sseRes.text();
      if (/event:\s*error/i.test(sseText)) {
        if (/quota/i.test(sseText)) {
          options.onQuotaHit?.();
        }
        options.fallbackPath?.push(`${options.engineName} queue/quota error`);
        return null;
      }

      const completeMatch = sseText.match(/event:\s*complete[\r\n]+data:\s*(.+)/);
      if (!completeMatch) {
        options.fallbackPath?.push(`${options.engineName} incomplete stream`);
        return null;
      }
      const parsed = JSON.parse(completeMatch[1]) as unknown;
      const fileUrl = extractGradioImageUrl(parsed, options.spaceUrl);
      if (!fileUrl) {
        options.fallbackPath?.push(`${options.engineName} no image URL`);
        return null;
      }

      const imgRes = await fetch(fileUrl, { headers: getHfHeaders(), signal: controller.signal });
      if (!imgRes.ok) {
        options.fallbackPath?.push(`${options.engineName} file HTTP ${imgRes.status}`);
        return null;
      }
      const contentType = (imgRes.headers.get("content-type") || "image/webp").split(";")[0];
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length < 2000) {
        options.fallbackPath?.push(`${options.engineName} tiny image payload`);
        return null;
      }
      return {
        dataUrl: `data:${contentType};base64,${buf.toString("base64")}`,
        mimeType: contentType,
        engine: options.engineName,
        remoteUrl: fileUrl,
        quotaHit: false,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "timeout";
      options.fallbackPath?.push(`${options.engineName} failed (${msg})`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function callFluxMergedL40S(
    prompt: string,
    width: number,
    height: number,
    fallbackPath?: string[]
  ): Promise<{ dataUrl: string; mimeType: string; engine: string; remoteUrl: string } | null> {
    if (Date.now() < hfFluxMergedCooldownUntil) {
      fallbackPath?.push("FLUX.1-merged (L40S) in short cooldown");
      return null;
    }
    const res = await callHfImageGradioSpace({
      spaceUrl: "https://multimodalart-flux-1-merged.hf.space",
      endpoint: "infer",
      data: [prompt, 0, true, width, height, 3.5, 8],
      engineName: "FLUX.1-merged (Dedicated L40S)",
      timeoutMs: 13000,
      fallbackPath,
      onQuotaHit: () => {
        hfFluxMergedCooldownUntil = Date.now() + 45000;
      },
    });
    if (res) {
      return {
        dataUrl: res.dataUrl,
        mimeType: res.mimeType,
        engine: res.engine,
        remoteUrl: res.remoteUrl,
      };
    }
    hfFluxMergedCooldownUntil = Math.max(hfFluxMergedCooldownUntil, Date.now() + 25000);
    return null;
  }

  async function callSanaSprintServer(
    prompt: string,
    width: number,
    height: number,
    fallbackPath?: string[]
  ): Promise<{ dataUrl: string; mimeType: string; engine: string; remoteUrl: string } | null> {
    if (Date.now() < hfSanaSprintCooldownUntil) return null;
    const res = await callHfImageGradioSpace({
      spaceUrl: "https://efficient-large-model-sanasprint.hf.space",
      endpoint: "infer",
      data: [prompt, "1.6B", 0, true, Math.min(1024, width), Math.min(1024, height), 4.5, 2],
      engineName: "NVIDIA SanaSprint (Open-Source)",
      timeoutMs: 12000,
      fallbackPath,
      onQuotaHit: () => {
        hfSanaSprintCooldownUntil = Date.now() + 90000;
      },
    });
    if (res) {
      return {
        dataUrl: res.dataUrl,
        mimeType: res.mimeType,
        engine: res.engine,
        remoteUrl: res.remoteUrl,
      };
    }
    hfSanaSprintCooldownUntil = Math.max(hfSanaSprintCooldownUntil, Date.now() + 30000);
    return null;
  }

  // 100% Free, Watermark-Free Open-Source Image Generation Endpoint
  app.post("/api/image", async (req, res) => {
    const body = req.body as ImageRequestBody;
    const rawPrompt = (body?.prompt || "").trim();
    const aspectRatio = body?.aspectRatio || "1:1";
    const style = body?.style || "photorealistic";
    const enhancePrompt = body?.enhancePrompt !== false;

    if (!rawPrompt) {
      res.status(400).json({ error: "Please provide an image description." });
      return;
    }

    const { width, height } = getDimensionsForAspectRatio(aspectRatio);
    const styleDescriptors: Record<string, string> = {
      photorealistic:
        "shot on 85mm f/1.4 prime lens, natural volumetric lighting, subtle rim highlights, authentic micro-textures, balanced filmic exposure, crisp focus",
      editorial:
        "editorial medium-format film photography, directional key light, rich tonal contrast, architectural framing, subtle organic grain, lifelike skin and fabric texture",
      vector:
        "refined flat geometric vector illustration, clean crisp Bézier paths, harmonious limited palette, strong negative space, zero gradients or noise",
      "3d-render":
        "Octane path-traced studio 3D render, physically based subsurface scattering, soft global illumination, tactile matte clay and brushed metal materials, clean composition",
      "concept-art":
        "cinema production concept painting, atmospheric perspective, dramatic chiaroscuro lighting, expressive brushwork, rich environmental storytelling and depth",
    };

    let finalPrompt = `${rawPrompt}, ${styleDescriptors[style] || styleDescriptors.photorealistic}`.trim();
    const fallbackPath: string[] = [];
    const ai = getGeminiClient();

    if (enhancePrompt && ai) {
      try {
        const enhPromise = ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: `You are an expert photography and art director. Expand this prompt into one rich, concrete visual description (40-60 words, no quotes, no preamble, no "8k/masterpiece" buzzwords) in style "${style}":
Specify subject posture/details, lighting direction and color temperature, lens/framing, background depth, and material textures.
Input: ${rawPrompt}`,
        });
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 3200)
        );
        const enhResp = await Promise.race([enhPromise, timeoutPromise]);
        const candidate = enhResp?.text?.trim().replace(/^["']|["']$/g, "");
        if (candidate && candidate.length > 12 && candidate.length < 520) {
          finalPrompt = candidate;
        }
      } catch {
        fallbackPath.push("Prompt enhancer skipped");
      }
    }

    let serverQuotaHits = 0;

    const callHfGradioSpace = async (options: {
      spaceUrl: string;
      endpoint: string;
      data: unknown[];
      engineName: string;
      timeoutMs: number;
      onQuotaHit: () => void;
    }): Promise<{ dataUrl: string; mimeType: string; engine: string } | null> => {
      const r = await callHfImageGradioSpace({
        ...options,
        fallbackPath,
        onQuotaHit: () => {
          serverQuotaHits += 1;
          options.onQuotaHit();
        },
      });
      return r ? { dataUrl: r.dataUrl, mimeType: r.mimeType, engine: r.engine } : null;
    };

    let result: { dataUrl: string; mimeType: string; engine: string } | null = null;
    let gotWatermarkFreeRaster = false;

    if (style !== "vector") {
      // Strictly BEST-FIRST -> Backups across verified working open-source models
      if (Date.now() >= serverZeroGpuImageBlockedUntil) {
        // 1. FLUX.2-dev (Flagship)
        if (Date.now() >= hfFlux2CooldownUntil) {
          result = await callHfGradioSpace({
            spaceUrl: "https://black-forest-labs-flux-2-dev.hf.space",
            endpoint: "infer",
            data: [finalPrompt, [], 0, true, width, height, 24, 4, true],
            engineName: "FLUX.2-dev (Open-Source Flagship)",
            timeoutMs: 14000,
            onQuotaHit: () => {
              hfFlux2CooldownUntil = Date.now() + 90000;
              serverZeroGpuImageBlockedUntil = Date.now() + 90000;
            },
          });
        }

        // 2. FLUX.1-dev (Flagship)
        if (!result && serverQuotaHits === 0 && Date.now() >= hfFluxDevCooldownUntil) {
          result = await callHfGradioSpace({
            spaceUrl: "https://black-forest-labs-flux-1-dev.hf.space",
            endpoint: "infer",
            data: [finalPrompt, 0, true, width, height, 3.5, 24],
            engineName: "FLUX.1-dev (Open-Source Flagship)",
            timeoutMs: 14000,
            onQuotaHit: () => {
              hfFluxDevCooldownUntil = Date.now() + 90000;
              serverZeroGpuImageBlockedUntil = Date.now() + 90000;
            },
          });
        }

        // 3. FLUX.1-merged (L40S)
        if (!result && serverQuotaHits === 0) {
          const l40s = await callFluxMergedL40S(finalPrompt, width, height, fallbackPath);
          if (l40s) {
            result = { dataUrl: l40s.dataUrl, mimeType: l40s.mimeType, engine: l40s.engine };
          }
        }

        // 4. Stability AI SD 3.5 Large
        if (!result && serverQuotaHits === 0 && Date.now() >= hfSd35CooldownUntil) {
          result = await callHfGradioSpace({
            spaceUrl: "https://stabilityai-stable-diffusion-3-5-large.hf.space",
            endpoint: "infer",
            data: [finalPrompt, "blurry, deformed, watermark, text", 0, true, width, height, 4.5, 28],
            engineName: "Stable Diffusion 3.5 Large (Open-Source)",
            timeoutMs: 14000,
            onQuotaHit: () => {
              hfSd35CooldownUntil = Date.now() + 90000;
              serverZeroGpuImageBlockedUntil = Date.now() + 90000;
            },
          });
        }

        // 5. Qwen-Image
        if (!result && serverQuotaHits === 0 && Date.now() >= hfQwenImageCooldownUntil) {
          result = await callHfGradioSpace({
            spaceUrl: "https://qwen-qwen-image.hf.space",
            endpoint: "infer",
            data: [finalPrompt, 0, true, mapQwenAspectRatio(aspectRatio), 4, 28, true],
            engineName: "Qwen-Image (Open-Source Flagship)",
            timeoutMs: 14000,
            onQuotaHit: () => {
              hfQwenImageCooldownUntil = Date.now() + 90000;
              serverZeroGpuImageBlockedUntil = Date.now() + 90000;
            },
          });
        }

        // 6. Qwen-Image-2.1 (/generate 5 args)
        if (!result && serverQuotaHits === 0 && Date.now() >= hfQwen21CooldownUntil) {
          result = await callHfGradioSpace({
            spaceUrl: "https://linoyts-qwen-image-2-1-realtime.hf.space",
            endpoint: "generate",
            data: [finalPrompt, [], 0, 1024, "Auto"],
            engineName: "Qwen-Image-2.1 (Open-Source)",
            timeoutMs: 13000,
            onQuotaHit: () => {
              hfQwen21CooldownUntil = Date.now() + 90000;
              serverZeroGpuImageBlockedUntil = Date.now() + 90000;
            },
          });
        }

        // 7. FLUX.1-Krea-dev
        if (!result && serverQuotaHits === 0 && Date.now() >= hfKreaCooldownUntil) {
          result = await callHfGradioSpace({
            spaceUrl: "https://mcp-tools-flux-1-krea-dev.hf.space",
            endpoint: "infer",
            data: [finalPrompt, 0, true, width, height, 4.5, 24],
            engineName: "FLUX.1-Krea-dev (Open-Source)",
            timeoutMs: 12000,
            onQuotaHit: () => {
              hfKreaCooldownUntil = Date.now() + 90000;
            },
          });
        }

        // 8. Z-Image-Turbo
        if (!result && serverQuotaHits === 0 && Date.now() >= hfZImageCooldownUntil) {
          result = await callHfGradioSpace({
            spaceUrl: "https://tongyi-mai-z-image-turbo.hf.space",
            endpoint: "generate",
            data: [finalPrompt, mapZImageResolution(aspectRatio), 42, 8, 3, true, []],
            engineName: "Z-Image-Turbo (Open-Source)",
            timeoutMs: 12000,
            onQuotaHit: () => {
              hfZImageCooldownUntil = Date.now() + 90000;
            },
          });
        }

        // 9. FLUX.1-schnell
        if (!result && serverQuotaHits === 0 && Date.now() >= hfFluxCooldownUntil) {
          result = await callHfGradioSpace({
            spaceUrl: "https://black-forest-labs-flux-1-schnell.hf.space",
            endpoint: "infer",
            data: [finalPrompt, 0, true, width, height, 4],
            engineName: "FLUX.1-schnell (Open-Source)",
            timeoutMs: 12000,
            onQuotaHit: () => {
              hfFluxCooldownUntil = Date.now() + 90000;
            },
          });
        }
      }

      // 10. Verified Pollinations FLUX (HTTP 200 lifetime-free — NEVER use 402 sana/turbo!)
      if (!result) {
        result = await callServerPollinationsCropped(
          finalPrompt,
          width,
          height,
          ["flux"],
          fallbackPath
        );
      }

      // 11. AI Horde Flagship SDXL / Fast Photorealistic Tier (strictly <=5.0 free kudos cap!)
      if (!result) {
        result = await callAiHordeImage(finalPrompt, width, height, fallbackPath, 22000);
      }

      if (result) {
        gotWatermarkFreeRaster = true;
      }
    }

    const svgPrompt = `Create a rich, detailed, recognizable SVG illustration (viewBox="0 0 ${width} ${height}") depicting: ${finalPrompt}.
Requirements:
- Compose a full multi-layered scene: atmospheric background gradient, midground scenery/elements, and a detailed, recognizable foreground subject with shading, highlights, and depth.
- Use <defs> linearGradient/radialGradient, crisp layered <path>, <ellipse>, <polygon>, and <circle> shapes.
- Do NOT include any text captions, labels, or watermarks.
- Output ONLY valid raw <svg>...</svg> markup with no markdown fences.`;

    if (!result && ai) {
      for (const modelName of ["gemini-4-hydrogen", "gemini-3.1-flash-lite"]) {
        try {
          const genPromise = ai.models.generateContent({
            model: modelName,
            contents: svgPrompt,
          });
          const timeoutPromise = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 11000)
          );
          const svgResp = await Promise.race([genPromise, timeoutPromise]);
          const rawSvg = svgResp?.text?.trim() || "";
          const svgMatch = rawSvg.match(/<svg[\s\S]*<\/svg>/i);
          if (svgMatch) {
            const b64 = Buffer.from(svgMatch[0], "utf8").toString("base64");
            result = {
              dataUrl: `data:image/svg+xml;base64,${b64}`,
              mimeType: "image/svg+xml",
              engine: `${modelName === "gemini-4-hydrogen" ? "Gemini 4 Hydrogen" : "Gemini 3.1 Flash Lite"} Vector Studio`,
            };
            break;
          }
          fallbackPath.push(`${modelName} SVG returned empty`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "error";
          fallbackPath.push(`${modelName} SVG failed (${msg})`);
        }
      }
    }

    if (!result) {
      try {
        const llmSvg = await callPollinationsTextFallback(
          [{ role: "user", content: svgPrompt }],
          "You are an expert SVG vector illustrator. Output only valid raw <svg>...</svg> markup.",
          9000
        );
        const svgMatch = llmSvg.match(/<svg[\s\S]*<\/svg>/i);
        if (svgMatch) {
          const b64 = Buffer.from(svgMatch[0], "utf8").toString("base64");
          result = {
            dataUrl: `data:image/svg+xml;base64,${b64}`,
            mimeType: "image/svg+xml",
            engine: "Vector Studio",
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "error";
        fallbackPath.push(`LLM SVG fallback failed (${msg})`);
      }
    }

    if (!result) {
      const svgMarkup = buildProceduralSvgFallback(rawPrompt, width, height);
      const b64 = Buffer.from(svgMarkup, "utf8").toString("base64");
      result = {
        dataUrl: `data:image/svg+xml;base64,${b64}`,
        mimeType: "image/svg+xml",
        engine: "Procedural Vector Art",
      };
    }

    res.json({
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      prompt: rawPrompt,
      enhancedPrompt: finalPrompt !== rawPrompt ? finalPrompt : undefined,
      aspectRatio,
      style,
      dataUrl: result.dataUrl,
      mimeType: result.mimeType,
      engine: result.engine,
      fallbackPath,
      clientHfFallback:
        style !== "vector" && !gotWatermarkFreeRaster
          ? { prompt: finalPrompt, width, height, aspectRatio }
          : undefined,
      createdAt: Date.now(),
    });
  });

  // Dedicated server-side raster frame endpoint (Best-first verified sources -> backups)
  app.post("/api/raster-frame", async (req, res) => {
    const body = req.body as {
      prompt?: string;
      width?: number;
      height?: number;
      model?: string;
    };
    const prompt = (body?.prompt || "").trim();
    if (!prompt) {
      res.status(400).json({ error: "Missing prompt" });
      return;
    }
    const width = Math.min(1280, Math.max(512, Number(body?.width || 1024)));
    const height = Math.min(1280, Math.max(512, Number(body?.height || 576)));

    if (Date.now() >= serverZeroGpuImageBlockedUntil) {
      const l40s = await callFluxMergedL40S(prompt, width, height);
      if (l40s) {
        res.json({ dataUrl: l40s.dataUrl, mimeType: l40s.mimeType, engine: l40s.engine });
        return;
      }
    }

    // Best verified free server raster: Pollinations FLUX first (HTTP 200), then AI Horde (<=5 kudos)
    const cropped = await callServerPollinationsCropped(prompt, width, height, ["flux"]);
    if (cropped) {
      res.json(cropped);
      return;
    }

    const hordeRes = await callAiHordeImage(prompt, width, height, undefined, 18000);
    if (hordeRes) {
      res.json(hordeRes);
      return;
    }

    if (Date.now() >= serverZeroGpuImageBlockedUntil) {
      const sanaSp = await callSanaSprintServer(prompt, width, height);
      if (sanaSp) {
        res.json({ dataUrl: sanaSp.dataUrl, mimeType: sanaSp.mimeType, engine: sanaSp.engine });
        return;
      }
    }

    res.json({ dataUrl: "", mimeType: "", unavailable: true });
  });

  // Cooldown tracking for neural HF video spaces on server IP
  let hfLtx25CooldownUntil = 0;
  let hfUpsamplerLtx25CooldownUntil = 0;
  let hfLtx23CooldownUntil = 0;
  let hfLtx2TurboCooldownUntil = 0;
  let hfLtxDistilledCooldownUntil = 0;
  let hfCogVideoX2BCooldownUntil = 0;
  let hfWan22FasterCooldownUntil = 0;
  let hfWan21FastCooldownUntil = 0;
  let hfAnimateDiffCooldownUntil = 0;
  let hfHunyuanCooldownUntil = 0;
  let hfCogVideoXCooldownUntil = 0;
  let hfPrithivWan22CooldownUntil = 0;
  let hfCbensimonWan22CooldownUntil = 0;
  let hfR3gmWan22CooldownUntil = 0;
  let hfMcpWan22FlfCooldownUntil = 0;

  function parseVideoDuration(raw: string): {
    visualPrompt: string;
    durationSec: number;
    requestedDurationSec?: number;
    durationNotice?: string;
  } {
    let requested: number | undefined;
    let cleaned = raw;

    const hourMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours)\b/i);
    const minMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i);
    const secMatch = raw.match(
      /\b(\d+(?:\.\d+)?)\s*(?:-?\s*)(?:s|sec|secs|second|seconds)\b/i
    );

    if (hourMatch) {
      requested = Math.round(parseFloat(hourMatch[1]) * 3600);
      cleaned = cleaned.replace(hourMatch[0], " ");
    } else if (minMatch) {
      requested = Math.round(parseFloat(minMatch[1]) * 60);
      cleaned = cleaned.replace(minMatch[0], " ");
    } else if (secMatch) {
      requested = Math.round(parseFloat(secMatch[1]));
      cleaned = cleaned.replace(secMatch[0], " ");
    }

    cleaned = cleaned
      .replace(/\b(?:for|about|around|lasting|long|length|duration)\s*$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!cleaned) cleaned = raw.trim();

    if (typeof requested === "number" && Number.isFinite(requested) && requested > 0) {
      if (requested > 15) {
        return {
          visualPrompt: cleaned,
          durationSec: 15,
          requestedDurationSec: requested,
          durationNotice: `The maximum video length that can be made in one attempt is 15 seconds (you requested ${requested}s). Generated a 15-second clip instead.`,
        };
      }
      return {
        visualPrompt: cleaned,
        durationSec: Math.max(2, Math.min(15, requested)),
        requestedDurationSec: requested,
      };
    }

    return {
      visualPrompt: cleaned,
      durationSec: 15,
    };
  }

  function deriveMotionScript(prompt: string, durationSec: number) {
    const lower = prompt.toLowerCase();
    let atmosphere: "sparkles" | "rain" | "snow" | "embers" | "stars" | "bokeh" | "none" = "none";
    let moodColors: [string, string, string] = ["#090D16", "#1E3A8A", "#3B82F6"];
    let camera: "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "orbit" = "zoom-in";

    if (/snow|winter|ice|blizzard|frost|arctic/.test(lower)) {
      atmosphere = "snow";
      moodColors = ["#082F49", "#0369A1", "#BAE6FD"];
    } else if (/rain|storm|cyberpunk|neon|street|tokyo/.test(lower)) {
      atmosphere = "rain";
      moodColors = ["#090D16", "#312E81", "#38BDF8"];
    } else if (/fire|flame|volcano|lava|dragon|ember|inferno/.test(lower)) {
      atmosphere = "embers";
      moodColors = ["#1A0B1C", "#9A3412", "#FB923C"];
    } else if (/space|galaxy|star|moon|planet|cosmos|night|nebula/.test(lower)) {
      atmosphere = "stars";
      moodColors = ["#05070E", "#1E1B4B", "#6366F1"];
    } else if (/city|portrait|cafe|golden|sunset|warm|bokeh/.test(lower)) {
      atmosphere = "bokeh";
      moodColors = ["#18181B", "#713F12", "#F59E0B"];
    }

    if (/pan|chase|run|fly|flying|drive|racing|ocean|horizon/.test(lower)) {
      camera = "pan-right";
    } else if (/reveal|pull back|wide|mountain|landscape/.test(lower)) {
      camera = "zoom-out";
    } else if (/orbit|spin|3d|planet|circle/.test(lower)) {
      camera = "orbit";
    }

    return {
      camera,
      atmosphere,
      moodColors,
      durationSec,
    };
  }

  function extractGradioVideoUrl(parsed: unknown, spaceUrl?: string): string | null {
    const queue: unknown[] = [parsed];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (!cur || typeof cur !== "object") continue;
      if (Array.isArray(cur)) {
        queue.push(...cur);
        continue;
      }
      const obj = cur as Record<string, unknown>;
      if (typeof obj.url === "string" && /\.(mp4|webm|mov|gif)(\?|$)/i.test(obj.url)) {
        return obj.url;
      }
      if (typeof obj.path === "string" && spaceUrl && /\.(mp4|webm|mov|gif)(\?|$)/i.test(obj.path)) {
        return `${spaceUrl}/gradio_api/file=${obj.path}`;
      }
      if (obj.video && typeof obj.video === "object") {
        const vidObj = obj.video as Record<string, unknown>;
        if (typeof vidObj.url === "string") return vidObj.url;
        if (typeof vidObj.path === "string" && spaceUrl) return `${spaceUrl}/gradio_api/file=${vidObj.path}`;
      }
      if (typeof obj.url === "string" && /\/file=/.test(obj.url)) {
        return obj.url;
      }
    }
    return null;
  }

  // 100% Free Multi-Tier Real Video Generation Endpoint (Neural Open-Source T2V/I2V + Lifetime-Free AI Cinema Motion Engine)
  app.post("/api/video", async (req, res) => {
    const body = req.body as {
      prompt?: string;
      durationSec?: number;
      aspectRatio?: string;
    };
    const rawPrompt = (body?.prompt || "").trim();

    if (!rawPrompt) {
      res.status(400).json({ error: "Please provide a video description." });
      return;
    }

    const parsedDur = parseVideoDuration(rawPrompt);
    let durationSec = parsedDur.durationSec;
    let requestedDurationSec = parsedDur.requestedDurationSec;
    let durationNotice = parsedDur.durationNotice;

    if (
      typeof body?.durationSec === "number" &&
      Number.isFinite(body.durationSec) &&
      body.durationSec > 0 &&
      !parsedDur.requestedDurationSec
    ) {
      const reqS = Math.round(body.durationSec);
      requestedDurationSec = reqS;
      if (reqS > 15) {
        durationSec = 15;
        durationNotice = `The maximum video length that can be made in one attempt is 15 seconds (you requested ${reqS}s). Generated a 15-second clip instead.`;
      } else {
        durationSec = Math.max(2, Math.min(15, reqS));
      }
    }

    const ratioHint =
      body?.aspectRatio ||
      (/\b(?:9:16|vertical|portrait|reels|tiktok|shorts)\b/i.test(rawPrompt)
        ? "9:16"
        : /\b(?:1:1|square)\b/i.test(rawPrompt)
          ? "1:1"
          : "16:9");
    const { aspectRatio, width, height } = getVideoDimensions(ratioHint);
    const visualPrompt = parsedDur.visualPrompt;

    let finalPrompt = `${visualPrompt}, smooth cinematic camera movement, rich volumetric lighting, fluid motion`;
    const fallbackPath: string[] = [];

    const callHfVideoSpace = async (options: {
      spaceUrl: string;
      endpoint: string;
      data: unknown[];
      engineName: string;
      timeoutMs: number;
      onQuotaHit: () => void;
      signal?: AbortSignal;
    }): Promise<{ dataUrl: string; mimeType: string; engine: string } | null> => {
      const controller = new AbortController();
      const onParentAbort = () => controller.abort();
      options.signal?.addEventListener("abort", onParentAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), options.timeoutMs);
      try {
        const postRes = await fetch(
          `${options.spaceUrl}/gradio_api/call/${options.endpoint}`,
          {
            method: "POST",
            headers: getHfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ data: options.data }),
            signal: controller.signal,
          }
        );
        if (!postRes.ok) {
          if (postRes.status === 429) options.onQuotaHit();
          fallbackPath.push(`${options.engineName} POST HTTP ${postRes.status}`);
          return null;
        }
        const postJson = (await postRes.json()) as { event_id?: string };
        if (!postJson.event_id) {
          fallbackPath.push(`${options.engineName} missing event_id`);
          return null;
        }

        const sseRes = await fetch(
          `${options.spaceUrl}/gradio_api/call/${options.endpoint}/${postJson.event_id}`,
          { headers: getHfHeaders(), signal: controller.signal }
        );
        if (!sseRes.ok) {
          fallbackPath.push(`${options.engineName} SSE HTTP ${sseRes.status}`);
          return null;
        }
        const sseText = await sseRes.text();
        if (/event:\s*error/i.test(sseText)) {
          if (/quota|exceeded|429|limit/i.test(sseText)) {
            options.onQuotaHit();
            fallbackPath.push(`${options.engineName} ZeroGPU quota`);
          } else {
            fallbackPath.push(`${options.engineName} error: ${sseText.slice(0, 120)}`);
          }
          return null;
        }

        const completeMatch = sseText.match(
          /event:\s*complete[\r\n]+data:\s*(.+)/
        );
        if (!completeMatch) {
          fallbackPath.push(`${options.engineName} incomplete stream`);
          return null;
        }
        const parsed = JSON.parse(completeMatch[1]) as unknown;
        const fileUrl = extractGradioVideoUrl(parsed, options.spaceUrl);
        if (!fileUrl) {
          fallbackPath.push(`${options.engineName} no video URL`);
          return null;
        }

        const vidRes = await fetch(fileUrl, {
          headers: getHfHeaders(),
          signal: controller.signal,
        });
        if (!vidRes.ok) {
          fallbackPath.push(`${options.engineName} file HTTP ${vidRes.status}`);
          return null;
        }
        const contentType = (vidRes.headers.get("content-type") || "video/mp4").split(";")[0];
        const buf = Buffer.from(await vidRes.arrayBuffer());
        if (buf.length < 4000) {
          fallbackPath.push(`${options.engineName} tiny payload`);
          return null;
        }
        return {
          dataUrl: `data:${contentType};base64,${buf.toString("base64")}`,
          mimeType: contentType,
          engine: options.engineName,
        };
      } catch (err) {
        if (!options.signal?.aborted) {
          const msg = err instanceof Error ? err.message : "timeout";
          fallbackPath.push(`${options.engineName} failed (${msg})`);
        }
        return null;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onParentAbort);
      }
    };

    const uploadDataUrlToGradio = async (
      spaceUrl: string,
      dataUrl: string,
      signal?: AbortSignal
    ): Promise<{ path: string; meta: { _type: "gradio.FileData" } } | null> => {
      try {
        const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) return null;
        const mime = m[1] || "image/jpeg";
        const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
        const bytes = Buffer.from(m[2], "base64");
        const fd = new FormData();
        fd.append("files", new Blob([bytes], { type: mime }), `frame.${ext}`);
        const upRes = await fetch(`${spaceUrl}/gradio_api/upload`, {
          method: "POST",
          headers: getHfHeaders(),
          body: fd,
          signal: signal || AbortSignal.timeout(7000),
        });
        if (!upRes.ok) return null;
        const arr = (await upRes.json()) as string[];
        if (!Array.isArray(arr) || typeof arr[0] !== "string" || !arr[0]) return null;
        return { path: arr[0], meta: { _type: "gradio.FileData" } };
      } catch {
        return null;
      }
    };

    let videoResult: { dataUrl: string; mimeType: string; engine: string } | null = null;
    const nowMs = Date.now();
    const targetFrames = Math.min(85, Math.max(33, Math.round(durationSec * 12)));
    const vidH = aspectRatio === "9:16" ? 896 : aspectRatio === "1:1" ? 640 : 512;
    const vidW = aspectRatio === "9:16" ? 512 : aspectRatio === "1:1" ? 640 : 896;

    const t2vTierPool = [
      {
        ready: nowMs >= hfLtx25CooldownUntil,
        spaceUrl: "https://lightricks-ltx-2-5.hf.space",
        endpoint: "run",
        data: [
          finalPrompt,
          null,
          vidH,
          vidW,
          Math.min(5, durationSec),
          42,
          "conv",
          false,
          true,
          true,
        ],
        engineName: "Lightricks LTX-2.5 (Open-Source T2V)",
        onQuotaHit: () => {
          hfLtx25CooldownUntil = Date.now() + 90000;
        },
      },
      {
        ready: nowMs >= hfUpsamplerLtx25CooldownUntil,
        spaceUrl: "https://upsampler-ltx-2-5.hf.space",
        endpoint: "generate_video",
        data: [
          finalPrompt,
          null,
          vidH,
          vidW,
          Math.min(5, durationSec),
          42,
          "conv",
          false,
          true,
          true,
        ],
        engineName: "LTX-2.5 Upsampler (Open-Source T2V)",
        onQuotaHit: () => {
          hfUpsamplerLtx25CooldownUntil = Date.now() + 90000;
        },
      },
      {
        ready: nowMs >= hfLtx23CooldownUntil,
        spaceUrl: "https://lightricks-ltx-2-3.hf.space",
        endpoint: "generate_video",
        data: [
          null,
          finalPrompt,
          Math.min(8, Math.max(2, durationSec)),
          false,
          10,
          true,
          vidH,
          vidW,
        ],
        engineName: "Lightricks LTX-2.3 (Open-Source T2V)",
        onQuotaHit: () => {
          hfLtx23CooldownUntil = Date.now() + 90000;
        },
      },
      {
        ready: nowMs >= hfWan21FastCooldownUntil,
        spaceUrl: "https://multimodalart-wan2-1-fast.hf.space",
        endpoint: "generate_video",
        data: [
          null,
          finalPrompt,
          vidH,
          vidW,
          "blurry, static, distorted",
          Math.min(4, durationSec),
          1,
          4,
          42,
          true,
        ],
        engineName: "Wan 2.1 Fast (Open-Source T2V)",
        onQuotaHit: () => {
          hfWan21FastCooldownUntil = Date.now() + 90000;
        },
      },
      {
        ready: nowMs >= hfHunyuanCooldownUntil,
        spaceUrl: "https://multimodalart-hunyuan-video-1-5.hf.space",
        endpoint: "generate",
        data: [null, finalPrompt, targetFrames, 6, 5, -1, 1, true],
        engineName: "Hunyuan-Video-1.5 (Open-Source T2V)",
        onQuotaHit: () => {
          hfHunyuanCooldownUntil = Date.now() + 90000;
        },
      },
      {
        ready: nowMs >= hfLtxDistilledCooldownUntil,
        spaceUrl: "https://lightricks-ltx-video-distilled.hf.space",
        endpoint: "text_to_video",
        data: [
          finalPrompt,
          "worst quality, inconsistent motion, blurry, jittery, distorted",
          null,
          null,
          vidH,
          vidW,
          "text-to-video",
          Math.min(4, durationSec),
          9,
          42,
          true,
          1,
          true,
        ],
        engineName: "Lightricks LTX-Video Distilled (Open-Source T2V)",
        onQuotaHit: () => {
          hfLtxDistilledCooldownUntil = Date.now() + 90000;
        },
      },
      {
        ready: nowMs >= hfCogVideoX2BCooldownUntil,
        spaceUrl: "https://zai-org-cogvideox-2b-space.hf.space",
        endpoint: "generate",
        data: [finalPrompt, 30, 6],
        engineName: "CogVideoX-2B (Open-Source T2V)",
        onQuotaHit: () => {
          hfCogVideoX2BCooldownUntil = Date.now() + 90000;
        },
      },
      {
        ready: nowMs >= hfCogVideoXCooldownUntil,
        spaceUrl: "https://zai-org-cogvideox-5b-space.hf.space",
        endpoint: "generate",
        data: [finalPrompt, null, null, 0.8, -1, false, false],
        engineName: "CogVideoX-5B (Open-Source T2V)",
        onQuotaHit: () => {
          hfCogVideoXCooldownUntil = Date.now() + 90000;
        },
      },
    ];

    const readyT2v =
      Date.now() >= serverZeroGpuVideoBlockedUntil
        ? t2vTierPool.filter((t) => t.ready)
        : [];
    // Fail-fast on ZeroGPU shared server IP quota: stop immediately if any space hits quota so client browser runs with its own IP
    if (readyT2v.length > 0) {
      for (let idx = 0; idx < readyT2v.length && !videoResult && Date.now() >= serverZeroGpuVideoBlockedUntil; idx += 2) {
        const pair = readyT2v.slice(idx, idx + 2);
        const pairCtrl = new AbortController();
        const tasks = pair.map(async (tier) => {
          const r = await callHfVideoSpace({
            ...tier,
            onQuotaHit: () => {
              tier.onQuotaHit();
              serverZeroGpuVideoBlockedUntil = Date.now() + 90000;
              pairCtrl.abort();
            },
            timeoutMs: idx === 0 ? 15000 : 12000,
            signal: pairCtrl.signal,
          });
          if (!r) throw new Error("tier_failed");
          pairCtrl.abort();
          return r;
        });
        try {
          videoResult = await Promise.any(tasks);
        } catch {
          videoResult = null;
        }
      }
    } else {
      fallbackPath.push("Server ZeroGPU T2V cooldown active");
    }

    if (videoResult) {
      res.json({
        id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        prompt: rawPrompt,
        enhancedPrompt: finalPrompt !== rawPrompt ? finalPrompt : undefined,
        aspectRatio,
        dataUrl: videoResult.dataUrl,
        mimeType: videoResult.mimeType,
        engine: videoResult.engine,
        fallbackPath,
        durationSec,
        requestedDurationSec,
        durationNotice,
        createdAt: Date.now(),
      });
      return;
    }

    // Generate progressive 3-shot visual storyboard matching EXACTLY what the user asked for
    const buildStoryboardScenes = async (): Promise<
      Array<{
        prompt: string;
        camera: "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "orbit";
      }>
    > => {
      const defaultScenes: Array<{
        prompt: string;
        camera: "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "orbit";
      }> = [
        {
          prompt: `Wide establishing cinematic film still: ${visualPrompt}, rich natural lighting, photorealistic, crisp detail`,
          camera: "zoom-in",
        },
        {
          prompt: `Dynamic mid-action cinematic frame in motion: ${visualPrompt}, expressive camera tracking angle, vibrant lighting`,
          camera: "pan-right",
        },
        {
          prompt: `Dramatic close-up climax film shot: ${visualPrompt}, rim lighting, shallow depth of field`,
          camera: "orbit",
        },
      ];
      const ai = getGeminiClient();
      if (!ai) return defaultScenes;
      try {
        const sbPrompt = `Break this video request into 3 sequential visual film frames (wide opening -> mid-action -> dramatic climax) showing the EXACT subject, action, and setting requested: "${visualPrompt}".
Output strictly 3 concise lines (25-40 words each, photorealistic movie-still description only, NO quotes, NO labels like "Shot 1:"):
===SHOT_1===
opening wide frame description
===SHOT_2===
mid-action motion frame description
===SHOT_3===
dramatic close-up climax frame description`;
        const genP = ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: sbPrompt,
        });
        const timeoutP = new Promise<null>((r) => setTimeout(() => r(null), 4500));
        const sbResp = await Promise.race([genP, timeoutP]);
        const txt = sbResp?.text || "";
        const s1 = txt.match(/===SHOT_1===([\s\S]*?)===SHOT_2===/i)?.[1]?.trim();
        const s2 = txt.match(/===SHOT_2===([\s\S]*?)===SHOT_3===/i)?.[1]?.trim();
        const s3 = txt.match(/===SHOT_3===([\s\S]*)$/i)?.[1]?.trim();
        if (s1 && s2 && s3) {
          return [
            { prompt: s1.slice(0, 320), camera: "zoom-in" },
            { prompt: s2.slice(0, 320), camera: "pan-right" },
            { prompt: s3.slice(0, 320), camera: "orbit" },
          ];
        }
      } catch {
        // use default scenes
      }
      return defaultScenes;
    };

    const storyboardScenes = await buildStoryboardScenes();

    // Acquire MULTIPLE distinct real open-source AI diffusion keyframes (Pollinations FLUX + AI Horde <=5 kudos batch)
    const [shot1Img, hordeBatch] = await Promise.all([
      callServerPollinationsCropped(
        storyboardScenes[0].prompt,
        width,
        height,
        ["flux"],
        fallbackPath
      ),
      callAiHordeImageBatch(
        storyboardScenes[1].prompt,
        width,
        height,
        3,
        fallbackPath,
        18000,
        "backup"
      ),
    ]);

    const posterDataUrl =
      shot1Img?.dataUrl ||
      hordeBatch[0]?.dataUrl ||
      "";
    const posterMime =
      shot1Img?.mimeType ||
      hordeBatch[0]?.mimeType ||
      "image/jpeg";
    const remoteRefUrl = shot1Img?.remoteUrl;

    // Server-side Image-to-Video attempt only if ZeroGPU quota isn't blocked on server IP
    if ((posterDataUrl || remoteRefUrl) && !videoResult && Date.now() >= serverZeroGpuVideoBlockedUntil) {
      const endFrameDataUrl = hordeBatch[0]?.dataUrl || shot1Img?.dataUrl || "";
      const posterB64Only = posterDataUrl.replace(/^data:[^;]+;base64,/, "");
      const i2vSpecs = [
        {
          ready: Date.now() >= hfMcpWan22FlfCooldownUntil,
          spaceUrl: "https://multimodalart-wan-2-2-first-last-frame.hf.space",
          endpoint: "generate_video",
          engineName: "Wan 2.2 First-Last-Frame I2V (Open-Source Flagship)",
          needsEnd: true,
          buildData: (f: unknown, f2?: unknown) => [f, f2 || null, finalPrompt, "static, blurry, distorted", 2.5, 6, 1, 1, 42, true],
          onQuotaHit: () => { hfMcpWan22FlfCooldownUntil = Date.now() + 90000; serverZeroGpuVideoBlockedUntil = Date.now() + 90000; },
        },
        {
          ready: Date.now() >= hfLtx23CooldownUntil,
          spaceUrl: "https://linoyts-ltx-2-3-first-last-frame.hf.space",
          endpoint: "generate_video",
          engineName: "LTX-2.3 First-Last-Frame I2V (Open-Source Flagship)",
          needsEnd: true,
          buildData: (f: unknown, f2?: unknown) => [f, f2 || null, null, finalPrompt, 3, true, 10, true, vidH, vidW],
          onQuotaHit: () => { hfLtx23CooldownUntil = Date.now() + 90000; serverZeroGpuVideoBlockedUntil = Date.now() + 90000; },
        },
        {
          ready: Date.now() >= hfPrithivWan22CooldownUntil,
          spaceUrl: "https://prashant-ai-ml-wan-2-2-pro-superb.hf.space",
          endpoint: "generate_video",
          engineName: "Wan 2.2 Pro Superb I2V (Open-Source)",
          needsEnd: true,
          buildData: (f: unknown, f2?: unknown) => [f, f2 || null, finalPrompt, 6, "static, blurry, distorted, watermark", 3.5, 1, 1, 42, true, 6, "UniPCMultistep", 3, "16", true, true],
          onQuotaHit: () => { hfPrithivWan22CooldownUntil = Date.now() + 90000; serverZeroGpuVideoBlockedUntil = Date.now() + 90000; },
        },
        {
          ready: Date.now() >= hfWan22FasterCooldownUntil,
          spaceUrl: "https://zerogpu-aoti-wan2-2-fp8da-aoti-faster.hf.space",
          endpoint: "generate_video",
          engineName: "Wan 2.2 Faster AOTI I2V (Open-Source)",
          buildData: (f: unknown) => [f, finalPrompt, 4, "blurry, static, distorted", Math.min(3.5, durationSec), 1, 1, 42, true],
          onQuotaHit: () => { hfWan22FasterCooldownUntil = Date.now() + 90000; serverZeroGpuVideoBlockedUntil = Date.now() + 90000; },
        },
        {
          ready: Boolean(posterB64Only) && Date.now() >= hfPrithivWan22CooldownUntil,
          spaceUrl: "https://prithivmlmods-wan2-2-fast.hf.space",
          endpoint: "generate_video",
          engineName: "PrithivML Wan 2.2 Fast I2V (Open-Source)",
          directB64: true,
          buildData: () => [posterB64Only, finalPrompt, 6, "static, blurry, distorted", 3.5, 1, 1, 42, true],
          onQuotaHit: () => { hfPrithivWan22CooldownUntil = Date.now() + 90000; serverZeroGpuVideoBlockedUntil = Date.now() + 90000; },
        },
      ].filter((c) => c.ready);

      for (let i = 0; i < i2vSpecs.length && Date.now() >= serverZeroGpuVideoBlockedUntil; i += 2) {
        const pair = i2vSpecs.slice(i, i + 2);
        const pairCtrl = new AbortController();
        const tasks = pair.map(async (c) => {
          let fileObj: unknown = null;
          let endObj: unknown = null;
          if (!c.directB64) {
            const uploaded = posterDataUrl
              ? await uploadDataUrlToGradio(c.spaceUrl, posterDataUrl, pairCtrl.signal)
              : null;
            fileObj =
              uploaded ||
              (remoteRefUrl ? { url: remoteRefUrl, meta: { _type: "gradio.FileData" } } : null);
            if (!fileObj) throw new Error("no_ref_frame");
            if (c.needsEnd && endFrameDataUrl) {
              endObj = await uploadDataUrlToGradio(c.spaceUrl, endFrameDataUrl, pairCtrl.signal);
            }
          }
          const r = await callHfVideoSpace({
            spaceUrl: c.spaceUrl,
            endpoint: c.endpoint,
            data: c.buildData(fileObj, endObj),
            engineName: c.engineName,
            timeoutMs: 14000,
            onQuotaHit: () => {
              c.onQuotaHit();
              pairCtrl.abort();
            },
            signal: pairCtrl.signal,
          });
          if (!r) throw new Error("i2v_failed");
          pairCtrl.abort();
          return r;
        });
        try {
          const i2vWinner = await Promise.any(tasks);
          res.json({
            id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            prompt: rawPrompt,
            enhancedPrompt: finalPrompt !== rawPrompt ? finalPrompt : undefined,
            aspectRatio,
            dataUrl: i2vWinner.dataUrl,
            mimeType: i2vWinner.mimeType,
            engine: i2vWinner.engine,
            fallbackPath,
            durationSec,
            requestedDurationSec,
            durationNotice,
            createdAt: Date.now(),
          });
          return;
        } catch {
          // proceed cleanly
        }
      }
    }

    const realFramePool = [
      shot1Img?.dataUrl,
      ...hordeBatch.map((h) => h.dataUrl),
    ].filter((u): u is string => Boolean(u));

    const enrichedScenes = [
      {
        prompt: storyboardScenes[0].prompt,
        camera: storyboardScenes[0].camera,
        posterDataUrl: realFramePool[0] || undefined,
      },
      {
        prompt: storyboardScenes[1].prompt,
        camera: storyboardScenes[1].camera,
        posterDataUrl: realFramePool[1] || realFramePool[0] || undefined,
      },
      {
        prompt: storyboardScenes[2].prompt,
        camera: storyboardScenes[2].camera,
        posterDataUrl: realFramePool[2] || realFramePool[1] || undefined,
      },
    ];

    res.json({
      id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      prompt: rawPrompt,
      enhancedPrompt: finalPrompt !== rawPrompt ? finalPrompt : undefined,
      aspectRatio,
      dataUrl: posterDataUrl,
      posterDataUrl: posterDataUrl || undefined,
      mimeType: posterMime,
      engine: "Kestrel Open-Source Diffusion Cinema Engine",
      fallbackPath,
      durationSec,
      requestedDurationSec,
      durationNotice,
      clientHfVideoFallback: {
        prompt: finalPrompt,
        durationSec,
        aspectRatio,
        posterDataUrl: posterDataUrl || undefined,
        posterRemoteUrl: remoteRefUrl,
        scenes: enrichedScenes,
      },
      motionScript: deriveMotionScript(visualPrompt, durationSec),
      createdAt: Date.now(),
    });
  });

  // Persistent Sandbox Auto-Module Installer & Cache (downloads missing npm packages automatically on demand)
  const KESTREL_NPM_CACHE_DIR = path.join(os.tmpdir(), "kestrel_npm_cache");
  const NODE_BUILTIN_SET = new Set([
    ...builtinModules,
    ...builtinModules.map((m) => m.replace(/^node:/, "")),
  ]);
  let npmInstallLock: Promise<unknown> = Promise.resolve();

  function getNpmPackageRoot(spec: string): string | null {
    const clean = spec.trim();
    if (!clean || clean.startsWith(".") || clean.startsWith("/") || clean.startsWith("@/")) {
      return null;
    }
    if (clean.startsWith("node:") || NODE_BUILTIN_SET.has(clean.split("/")[0])) {
      return null;
    }
    if (clean.startsWith("@")) {
      const parts = clean.split("/");
      if (parts.length < 2) return null;
      const root = `${parts[0]}/${parts[1]}`;
      return /^@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-~][a-z0-9-._~]*$/.test(root) ? root : null;
    }
    const root = clean.split("/")[0];
    return /^[a-z0-9-~][a-z0-9-._~]*$/.test(root) ? root : null;
  }

  function isNpmPackageAvailable(pkgRoot: string, cacheOnly = false): boolean {
    const cachePath = path.join(KESTREL_NPM_CACHE_DIR, "node_modules", pkgRoot);
    if (cacheOnly) return fs.existsSync(cachePath);
    const appPath = path.join(__dirname, "node_modules", pkgRoot);
    return fs.existsSync(appPath) || fs.existsSync(cachePath);
  }

  async function ensureNpmPackages(specifiers: string[], cacheOnly = false): Promise<string[]> {
    const roots = Array.from(
      new Set(
        specifiers
          .map(getNpmPackageRoot)
          .filter((r): r is string => Boolean(r))
      )
    );
    const missing = roots.filter((r) => !isNpmPackageAvailable(r, cacheOnly));
    if (missing.length === 0) return [];

    const runInstall = async () => {
      const stillMissing = missing.filter((r) => !isNpmPackageAvailable(r, cacheOnly));
      if (stillMissing.length === 0) return stillMissing;
      fs.mkdirSync(KESTREL_NPM_CACHE_DIR, { recursive: true });
      const pkgJsonPath = path.join(KESTREL_NPM_CACHE_DIR, "package.json");
      if (!fs.existsSync(pkgJsonPath)) {
        fs.writeFileSync(
          pkgJsonPath,
          JSON.stringify({ name: "kestrel-sandbox-deps", private: true }),
          "utf8"
        );
      }
      try {
        await execFileAsync(
          "npm",
          [
            "install",
            "--no-save",
            "--no-audit",
            "--no-fund",
            "--prefer-offline",
            "--prefix",
            KESTREL_NPM_CACHE_DIR,
            ...stillMissing,
          ],
          {
            cwd: KESTREL_NPM_CACHE_DIR,
            timeout: 45000,
            maxBuffer: 512 * 1024,
            env: {
              PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
              HOME: KESTREL_NPM_CACHE_DIR,
            },
          }
        );
      } catch {
        // Fallback silently if single invalid package name failed; install remaining packages individually
        for (const pkg of stillMissing) {
          try {
            await execFileAsync(
              "npm",
              [
                "install",
                "--no-save",
                "--no-audit",
                "--no-fund",
                "--prefix",
                KESTREL_NPM_CACHE_DIR,
                pkg,
              ],
              { cwd: KESTREL_NPM_CACHE_DIR, timeout: 25000, maxBuffer: 256 * 1024 }
            );
          } catch {
            // ignore individual download miss
          }
        }
      }
      return stillMissing.filter((r) => isNpmPackageAvailable(r, cacheOnly));
    };

    const queued = npmInstallLock.then(runInstall, runInstall);
    npmInstallLock = queued.catch(() => {});
    return queued;
  }

  function extractScriptImports(source: string): string[] {
    const specs = new Set<string>();
    for (const m of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
      specs.add(m[1]);
    }
    for (const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
      specs.add(m[1]);
    }
    for (const m of source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
      specs.add(m[1]);
    }
    for (const m of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
      specs.add(m[1]);
    }
    return Array.from(specs);
  }

  // In-App Multi-Language Sandboxed Code Execution Endpoint (Python 3, Node/JS, TypeScript, Bash, C, C++)
  app.post("/api/execute-code", async (req, res) => {
    const body = req.body as { language?: string; code?: string };
    const lang = (body?.language || "").toLowerCase().trim();
    const code = (body?.code || "").toString();

    if (!code.trim()) {
      res.status(400).json({ error: "No code supplied." });
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kestrel_exec_"));
    const t0 = Date.now();
    const cacheModulesDir = path.join(KESTREL_NPM_CACHE_DIR, "node_modules");
    const appModulesDir = path.join(__dirname, "node_modules");

    const linkSandboxNodeModules = () => {
      const targetNm = path.join(tmpDir, "node_modules");
      if (!fs.existsSync(targetNm) && fs.existsSync(cacheModulesDir)) {
        try {
          fs.symlinkSync(cacheModulesDir, targetNm, "dir");
        } catch {
          // fallback via NODE_PATH
        }
      }
    };

    const runBin = async (cmd: string, args: string[], timeoutMs = 8000) => {
      try {
        const out = await execFileAsync(cmd, args, {
          cwd: tmpDir,
          timeout: timeoutMs,
          maxBuffer: 256 * 1024,
          env: {
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
            HOME: tmpDir,
            LANG: "C.UTF-8",
            NODE_PATH: [cacheModulesDir, appModulesDir].join(path.delimiter),
          },
        });
        return {
          stdout: String(out.stdout || "").slice(0, 65536),
          stderr: String(out.stderr || "").slice(0, 32768),
          exitCode: 0,
        };
      } catch (err: unknown) {
        const e = err as { stdout?: string; stderr?: string; code?: number; message?: string; killed?: boolean };
        return {
          stdout: String(e.stdout || "").slice(0, 65536),
          stderr: (String(e.stderr || "") || (e.killed ? "Execution timed out (8s limit)." : e.message || "")).slice(0, 32768),
          exitCode: typeof e.code === "number" ? e.code : 1,
        };
      }
    };

    try {
      let result: { stdout: string; stderr: string; exitCode: number };
      let runtime = lang;

      if (lang === "python" || lang === "py") {
        runtime = "Python 3.11";
        const file = path.join(tmpDir, "main.py");
        fs.writeFileSync(file, code, "utf8");
        result = await runBin("python3", [file]);
      } else if (
        lang === "javascript" ||
        lang === "js" ||
        lang === "node" ||
        lang === "typescript" ||
        lang === "ts"
      ) {
        const isTs = lang === "typescript" || lang === "ts";
        runtime = isTs ? "TypeScript (tsx)" : "Node.js 22";
        const specs = extractScriptImports(code);
        if (specs.length > 0) {
          await ensureNpmPackages(specs, true);
        }
        linkSandboxNodeModules();
        const file = path.join(tmpDir, isTs ? "main.ts" : "main.mjs");
        fs.writeFileSync(file, code, "utf8");
        const localTsx = path.join(__dirname, "node_modules", ".bin", "tsx");
        const runnerCmd = isTs ? (fs.existsSync(localTsx) ? localTsx : "tsx") : "node";
        result = await runBin(runnerCmd, [file]);

        // If runtime hits dynamic missing module, install & retry once automatically
        if (result.exitCode !== 0 && result.stderr) {
          const missMatch = result.stderr.match(
            /(?:Cannot find package|Cannot find module)\s+['"]([^'"]+)['"]/i
          );
          if (missMatch?.[1]) {
            await ensureNpmPackages([missMatch[1]], true);
            linkSandboxNodeModules();
            result = await runBin(runnerCmd, [file]);
          }
        }
      } else if (lang === "bash" || lang === "sh" || lang === "shell" || lang === "zsh") {
        runtime = "Bash";
        const file = path.join(tmpDir, "script.sh");
        fs.writeFileSync(file, code, "utf8");
        result = await runBin("bash", [file]);
      } else if (lang === "c") {
        runtime = "GCC C";
        const src = path.join(tmpDir, "main.c");
        const bin = path.join(tmpDir, "app_c");
        fs.writeFileSync(src, code, "utf8");
        const compile = await runBin("gcc", [src, "-O2", "-lm", "-o", bin], 9000);
        if (compile.exitCode !== 0) {
          result = compile;
        } else {
          result = await runBin(bin, []);
        }
      } else if (lang === "cpp" || lang === "c++" || lang === "cc") {
        runtime = "G++ C++17";
        const src = path.join(tmpDir, "main.cpp");
        const bin = path.join(tmpDir, "app_cpp");
        fs.writeFileSync(src, code, "utf8");
        const compile = await runBin("g++", ["-std=c++17", src, "-O2", "-lm", "-o", bin], 9000);
        if (compile.exitCode !== 0) {
          result = compile;
        } else {
          result = await runBin(bin, []);
        }
      } else {
        result = { stdout: "", stderr: `Unsupported server runtime: ${lang}`, exitCode: 1 };
      }

      res.json({
        ...result,
        runtime,
        durationMs: Date.now() - t0,
      });
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  });

  // Shared silent code self-correction helper (used both by /api/compile-preview pre-repair and /api/auto-fix-code)
  async function repairCodeInternal(
    language: string,
    code: string,
    error: string,
    title = "Artifact"
  ): Promise<{ fixedCode: string; summary: string } | null> {
    const fixPrompt = `Fix the mistake in this ${language} code ("${title}") so it compiles and executes cleanly in a live browser preview sandbox without any errors.

REPORTED RUNTIME / SYNTAX ERROR:
${error.slice(0, 1000)}

SANDBOX CAPABILITIES:
- React (tsx/jsx): React 19 + hooks, TypeScript, Tailwind CSS, lucide-react icons, framer-motion / motion/react, and npm ESM packages. Must expose a default component (e.g. export default function App()). Avoid relative local file imports like ./styles.css.
- HTML (html): Complete single-file HTML5 with complete responsive <style> CSS and inline <script> JS (never bare HTML without CSS).
- Python (python): Runs on Python 3.11 (or Pyodide for matplotlib/numpy/pandas). Avoid interactive input() prompts; use sample values and print outputs cleanly.
- SQL (sql): Runs in SQLite WebAssembly (valid SQLite DDL/DML/SELECT queries).
- JS/TS (javascript/typescript): Runs in sandbox cleanly with console output or DOM mount.
- C / C++ (c/cpp): Compiled with gcc / g++ -std=c++17 -O2 -lm and executed immediately (include required headers, avoid scanf blocking).
- Bash (bash/sh): Runs in non-interactive bash shell cleanly.
- Mermaid / SVG: Valid syntax with explicit SVG viewBox.

CURRENT CODE:
${code.slice(0, 32000)}

OUTPUT FORMAT (follow strictly — NO markdown fences, NO extra prose):
===SUMMARY===
Brief 1-sentence description of the fix.
===FIXED_CODE===
Full corrected complete ${language} source code (never truncate or use placeholders)
===END_CODE===`;

    const extractFix = (raw: string): { fixedCode: string; summary: string } | null => {
      const sumMatch = raw.match(/===SUMMARY===([\s\S]*?)===FIXED_CODE===/i);
      const codeMatch = raw.match(/===FIXED_CODE===([\s\S]*?)(?:===END_CODE===|$)/i);
      if (!codeMatch) return null;
      const cleaned = codeMatch[1]
        .trim()
        .replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "")
        .replace(/\n?```\s*$/, "")
        .trim();
      if (cleaned.length < 16) return null;
      return {
        fixedCode: cleaned,
        summary: sumMatch?.[1]?.trim().slice(0, 180) || "Corrected code automatically.",
      };
    };

    const ai = getGeminiClient();
    if (ai) {
      const candidates: Array<{ model: string; thinking?: ThinkingLevel; timeoutMs: number }> = [];
      if (Date.now() >= gemini4CooldownUntil) {
        candidates.push({
          model: "gemini-4-hydrogen",
          thinking: ThinkingLevel.LOW,
          timeoutMs: 6500,
        });
      }
      candidates.push({ model: "gemini-3.1-flash-lite", timeoutMs: 18000 });

      for (const attempt of candidates) {
        try {
          const config: Record<string, unknown> = {};
          if (attempt.thinking && attempt.model === "gemini-4-hydrogen") {
            config.thinkingConfig = { thinkingLevel: attempt.thinking };
          }
          const genP = ai.models.generateContent({
            model: attempt.model,
            contents: fixPrompt,
            config,
          });
          const timeoutP = new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), attempt.timeoutMs)
          );
          const resp = await Promise.race([genP, timeoutP]);
          const txt = resp?.text;
          if (!txt) continue;
          const parsed = extractFix(txt);
          if (parsed) return parsed;
        } catch {
          // silently continue to next tier
        }
      }
    }

    try {
      const flagshipFix = await callAiHordeTextPool(
        [{ role: "user", content: fixPrompt }],
        "You are a senior software engineer. Output ONLY ===SUMMARY===, ===FIXED_CODE===, and ===END_CODE=== with complete runnable fixed code.",
        15000,
        "flagship"
      );
      const parsed = extractFix(flagshipFix.text);
      if (parsed) return parsed;
    } catch {
      // continue to open-weight reasoning backup
    }

    try {
      const pollText = await callPollinationsTextFallback(
        [{ role: "user", content: fixPrompt }],
        "Output ONLY ===SUMMARY===, ===FIXED_CODE===, and ===END_CODE=== with full corrected runnable source code.",
        18000
      );
      const parsed = extractFix(pollText);
      if (parsed) return parsed;
    } catch {
      // continue to HF coding spaces
    }

    const hfFix = await callHfCodingSpaceFallback(
      [{ role: "user", content: fixPrompt }],
      "Output ONLY ===SUMMARY===, ===FIXED_CODE===, and ===END_CODE=== with full corrected runnable source code."
    );
    if (hfFix) {
      const parsed = extractFix(hfFix.text);
      if (parsed) return parsed;
    }

    try {
      const backupFix = await callAiHordeTextPool(
        [{ role: "user", content: fixPrompt }],
        "Output ONLY ===SUMMARY===, ===FIXED_CODE===, and ===END_CODE=== with complete runnable fixed code.",
        14000,
        "backup"
      );
      const parsed = extractFix(backupFix.text);
      if (parsed) return parsed;
    } catch {
      // ignore
    }

    return null;
  }

  // Local pre-bundled React 19 + ReactDOM + Lucide-React + Motion/React runtime (eliminates brittle unpkg/Babel CDN failures in sandbox iframes)
  let runtimeBundlePromise: Promise<{
    bundleJs: string;
    esmShims: Record<string, string>;
  }> | null = null;

  async function getKestrelRuntimeAssets() {
    if (runtimeBundlePromise) return runtimeBundlePromise;
    runtimeBundlePromise = (async () => {
      const virtualEntry = `
        import * as ReactMod from "react";
        import * as ReactJsxMod from "react/jsx-runtime";
        import * as ReactDomMod from "react-dom";
        import * as ReactDomClientMod from "react-dom/client";
        import * as LucideMod from "lucide-react";
        import * as MotionMod from "motion/react";

        const g = window as any;
        g.__KestrelReact = ReactMod.default || ReactMod;
        g.__KestrelReactNs = ReactMod;
        g.__KestrelReactJsxRuntime = ReactJsxMod;
        g.__KestrelReactDOM = Object.assign({}, ReactDomMod, ReactDomClientMod);
        g.__KestrelReactDOMClient = ReactDomClientMod.default || ReactDomClientMod;
        g.__KestrelLucide = LucideMod;
        g.__KestrelMotion = MotionMod;
      `;

      const built = await esbuild.build({
        stdin: {
          contents: virtualEntry,
          resolveDir: __dirname,
          loader: "ts",
        },
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        target: "es2020",
        minify: true,
        define: {
          "process.env.NODE_ENV": '"production"',
        },
      });

      const bundleJs = built.outputFiles?.[0]?.text || "";

      // Inspect exact keys from installed React & ReactDOM packages to build matching local ESM shims for importmap
      const reactMod = await import("react");
      const reactDomMod = await import("react-dom");
      const reactDomClientMod = await import("react-dom/client");
      const reactJsxMod = await import("react/jsx-runtime");

      const makeEsmShim = (globalVar: string, modObj: Record<string, unknown>, extraExports: string[] = []) => {
        const keys = Array.from(
          new Set([
            ...Object.keys(modObj),
            ...(modObj.default && typeof modObj.default === "object"
              ? Object.keys(modObj.default as Record<string, unknown>)
              : []),
            ...extraExports,
          ])
        ).filter((k) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) && k !== "default" && k !== "__esModule");
        const namedLines = keys
          .map((k) => `export const ${k} = __mod[${JSON.stringify(k)}];`)
          .join("\n");
        return `const __mod = window[${JSON.stringify(globalVar)}] || {};\nexport default (__mod.default || __mod);\n${namedLines}\n`;
      };

      const esmShims: Record<string, string> = {
        "react.mjs": makeEsmShim("__KestrelReactNs", reactMod as Record<string, unknown>),
        "react-jsx-runtime.mjs": makeEsmShim("__KestrelReactJsxRuntime", reactJsxMod as Record<string, unknown>, ["jsx", "jsxs", "Fragment"]),
        "react-dom.mjs": makeEsmShim("__KestrelReactDOM", reactDomMod as Record<string, unknown>, ["createRoot", "hydrateRoot", "createPortal"]),
        "react-dom-client.mjs": makeEsmShim("__KestrelReactDOMClient", reactDomClientMod as Record<string, unknown>, ["createRoot", "hydrateRoot"]),
      };

      return { bundleJs, esmShims };
    })().catch((err) => {
      runtimeBundlePromise = null;
      throw err;
    });

    return runtimeBundlePromise;
  }

  app.get("/vendor/kestrel-runtime.js", async (_req, res) => {
    try {
      const { bundleJs } = await getKestrelRuntimeAssets();
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(bundleJs);
    } catch {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.send("/* runtime loading */");
    }
  });

  app.get("/vendor/esm/:file", async (req, res) => {
    try {
      const { esmShims } = await getKestrelRuntimeAssets();
      const file = String(req.params.file || "");
      const body = esmShims[file];
      if (!body) {
        res.status(404).type("text/javascript").send("// not found");
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(body);
    } catch {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.send("export default {};");
    }
  });

  const BUILTIN_PREVIEW_PKGS = new Set([
    "react",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "react-dom",
    "react-dom/client",
    "lucide-react",
    "framer-motion",
    "motion/react",
  ]);

  function detectComponentHint(source: string): string {
    const defFnMatch = source.match(
      /export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Z][A-Za-z0-9_]*)/
    );
    if (defFnMatch?.[1]) return defFnMatch[1];
    const allPascal = [
      ...source.matchAll(/(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)\b/g),
    ].map((m) => m[1]);
    const preferred = allPascal.find((n) =>
      /^(App|Dashboard|Main|Page|Demo|Preview|Workspace|Tracker|Game|Calculator|Studio)$/.test(n)
    );
    return preferred || allPascal[allPascal.length - 1] || "App";
  }

  function extractExternalRequirements(cjsCode: string): string[] {
    const reqs = new Set<string>();
    const re = /\brequire\(["']([^"']+)["']\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cjsCode)) !== null) {
      const pkg = m[1].trim();
      if (!pkg) continue;
      if (BUILTIN_PREVIEW_PKGS.has(pkg)) continue;
      if (pkg.startsWith(".") || pkg.startsWith("/") || pkg.startsWith("@/")) continue;
      if (/\.(?:css|scss|sass|less|png|jpg|jpeg|svg|webp|woff2?|json)$/i.test(pkg)) continue;
      reqs.add(pkg);
    }
    return Array.from(reqs);
  }

  // Auto-download missing npm modules into persistent sandbox cache and bundle them cleanly with React 19 singletons
  async function bundleExternalNpmModules(specifiers: string[]): Promise<{
    externalBundleJs: string;
    unresolvedExternals: string[];
  }> {
    if (specifiers.length === 0) {
      return { externalBundleJs: "", unresolvedExternals: [] };
    }

    await ensureNpmPackages(specifiers);

    const cacheNm = path.join(KESTREL_NPM_CACHE_DIR, "node_modules");
    const appNm = path.join(__dirname, "node_modules");
    const bundledParts: string[] = [];
    const unresolved: string[] = [];

    const sharedGlobalsPlugin: esbuild.Plugin = {
      name: "kestrel-shared-globals",
      setup(build) {
        build.onResolve(
          {
            filter:
              /^(?:react|react\/jsx-runtime|react\/jsx-dev-runtime|react-dom|react-dom\/client|lucide-react|framer-motion|motion\/react)$/,
          },
          (args) => ({ path: args.path, namespace: "kestrel-global" })
        );
        build.onLoad({ filter: /.*/, namespace: "kestrel-global" }, (args) => ({
          contents: `module.exports = window.__KestrelRequireBuiltin(${JSON.stringify(args.path)});`,
          loader: "js",
        }));
      },
    };

    const bundleList = async (targets: string[]): Promise<string | null> => {
      if (targets.length === 0) return "";
      const importsCode = targets
        .map((s, i) => `import * as __ext_${i} from ${JSON.stringify(s)};`)
        .join("\n");
      const mapCode = targets
        .map((s, i) => `  ${JSON.stringify(s)}: __ext_${i}`)
        .join(",\n");
      const entry = `${importsCode}\n(window as any).__KestrelExtModules = Object.assign((window as any).__KestrelExtModules || {}, {\n${mapCode}\n});\n`;

      const built = await esbuild.build({
        stdin: {
          contents: entry,
          resolveDir: fs.existsSync(cacheNm) ? KESTREL_NPM_CACHE_DIR : __dirname,
          loader: "ts",
        },
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        target: "es2020",
        minify: true,
        nodePaths: [cacheNm, appNm],
        plugins: [sharedGlobalsPlugin],
        loader: {
          ".css": "text",
          ".svg": "dataurl",
          ".png": "dataurl",
          ".jpg": "dataurl",
          ".woff": "dataurl",
          ".woff2": "dataurl",
        },
        define: {
          "process.env.NODE_ENV": '"production"',
          global: "window",
        },
      });
      return built.outputFiles?.[0]?.text || "";
    };

    try {
      const fullJs = await bundleList(specifiers);
      if (fullJs) {
        return { externalBundleJs: fullJs, unresolvedExternals: [] };
      }
    } catch {
      // Fallback: bundle each package individually so one failing lib doesn't block working ones
      for (const spec of specifiers) {
        try {
          const single = await bundleList([spec]);
          if (single) bundledParts.push(single);
          else unresolved.push(spec);
        } catch {
          unresolved.push(spec);
        }
      }
    }

    return {
      externalBundleJs: bundledParts.join("\n"),
      unresolvedExternals: unresolved,
    };
  }

  // Fast server-side TSX/JSX/TS/JS compiler + automatic npm downloader + pre-mount syntax self-repair
  app.post("/api/compile-preview", async (req, res) => {
    const body = req.body as {
      language?: string;
      code?: string;
      title?: string;
    };
    const lang = (body?.language || "tsx").toLowerCase().trim();
    const rawCode = (body?.code || "").toString();
    const title = (body?.title || "Artifact").toString();

    if (!rawCode.trim()) {
      res.json({ ok: false, error: "Empty source code." });
      return;
    }

    const isReactLang = lang === "tsx" || lang === "jsx" || lang === "react";
    const compileOnce = async (source: string) => {
      const hasJsx =
        isReactLang ||
        /<[A-Za-z][A-Za-z0-9]*(?:\s+[A-Za-z_:][A-Za-z0-9_.:-]*=(?:\{|"|')|\s*\/?>)/.test(source);
      const loader: esbuild.Loader = hasJsx ? "tsx" : "ts";

      try {
        return await esbuild.transform(source, {
          loader,
          format: "cjs",
          jsx: "transform",
          jsxFactory: "React.createElement",
          jsxFragment: "React.Fragment",
          target: "es2020",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/top-level await/i.test(msg)) throw err;
        // Wrap non-import body inside an async IIFE while preserving top-level import declarations
        const esmPre = await esbuild.transform(source, {
          loader,
          format: "esm",
          jsx: "transform",
          jsxFactory: "React.createElement",
          jsxFragment: "React.Fragment",
          target: "es2022",
        });
        const importLines: string[] = [];
        const bodyLines: string[] = [];
        for (const line of esmPre.code.split("\n")) {
          if (/^\s*import\s+/.test(line) && bodyLines.length === 0) {
            importLines.push(line);
          } else {
            bodyLines.push(line);
          }
        }
        const wrapped = `${importLines.join("\n")}\nmodule.exports = (async function() {\n${bodyLines.join("\n")}\n})();`;
        return esbuild.transform(wrapped, {
          loader: "js",
          format: "cjs",
          target: "es2020",
        });
      }
    };

    const finalizeCompiled = async (compiledCode: string, activeSource: string, repairedCode: string | null) => {
      const externals = extractExternalRequirements(compiledCode);
      const { externalBundleJs, unresolvedExternals } =
        externals.length > 0
          ? await bundleExternalNpmModules(externals)
          : { externalBundleJs: "", unresolvedExternals: [] };

      res.json({
        ok: true,
        compiledCode,
        repairedCode,
        externalBundleJs,
        externals: unresolvedExternals,
        componentHint: isReactLang ? detectComponentHint(activeSource) : "",
        isReact: isReactLang,
      });
    };

    try {
      const firstOut = await compileOnce(rawCode);
      await finalizeCompiled(firstOut.code, rawCode, null);
      return;
    } catch (firstErr) {
      const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      const repaired = await repairCodeInternal(lang, rawCode, errMsg, title);
      if (repaired?.fixedCode) {
        try {
          const secondOut = await compileOnce(repaired.fixedCode);
          await finalizeCompiled(secondOut.code, repaired.fixedCode, repaired.fixedCode);
          return;
        } catch (secondErr) {
          const secondMsg = secondErr instanceof Error ? secondErr.message : String(secondErr);
          res.json({ ok: false, error: secondMsg, repairedCode: repaired.fixedCode });
          return;
        }
      }
      res.json({ ok: false, error: errMsg });
    }
  });

  // Silent Automatic Artifact Self-Correction Endpoint
  app.post("/api/auto-fix-code", async (req, res) => {
    const body = req.body as {
      language?: string;
      code?: string;
      error?: string;
      title?: string;
    };
    const language = (body?.language || "tsx").trim();
    const code = (body?.code || "").trim();
    const error = (body?.error || "Runtime error").trim();
    const title = (body?.title || "Artifact").trim();

    if (!code) {
      res.json({ fixedCode: null, unavailable: true });
      return;
    }

    const parsed = await repairCodeInternal(language, code, error, title);
    if (parsed) {
      res.json(parsed);
      return;
    }

    res.json({ fixedCode: null, unavailable: true });
  });

  // Vite dev middleware or production static serving
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Kestrel AI server running on http://0.0.0.0:${PORT}`);
    // Pre-warm the local browser React/Lucide/Motion vendor runtime in the background
    void getKestrelRuntimeAssets().catch(() => {});
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
