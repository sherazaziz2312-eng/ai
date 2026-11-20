export type WorkspaceMode = 'chat' | 'code';

export type ThinkingDepth = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export type ImageStylePreset =
  | 'photorealistic'
  | 'editorial'
  | 'vector'
  | '3d-render'
  | 'concept-art';

export type VideoAspectRatio = '16:9' | '9:16' | '1:1';

export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'pdf' | 'text' | 'docx';
  /** Base64 string without data: prefix (for images/pdfs) */
  base64?: string;
  /** Preview data URL for images */
  previewUrl?: string;
  /** Extracted text content for text/code/docx/pdf fallback */
  extractedText?: string;
  /** Image dimensions if available */
  dimensions?: { width: number; height: number };
}

export interface GroundingSource {
  title: string;
  url: string;
}

export interface CodeArtifact {
  id: string;
  title: string;
  language: string;
  code: string;
  previewable: boolean;
}

export interface GeneratedImageItem {
  id: string;
  prompt: string;
  enhancedPrompt?: string;
  aspectRatio: ImageAspectRatio;
  style: ImageStylePreset;
  dataUrl: string;
  mimeType: string;
  engine: string;
  fallbackPath: string[];
  clientRasterUrl?: string;
  clientHfFallback?: {
    prompt: string;
    width: number;
    height: number;
    aspectRatio: ImageAspectRatio;
  };
  createdAt: number;
}

export interface VideoMotionScript {
  camera: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'orbit';
  atmosphere: 'sparkles' | 'rain' | 'snow' | 'embers' | 'stars' | 'bokeh' | 'none';
  moodColors: [string, string, string];
  durationSec: number;
}

export interface VideoStoryboardScene {
  prompt: string;
  camera: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'orbit';
  backupFluxUrl?: string;
  posterDataUrl?: string;
}

export interface GeneratedVideoItem {
  id: string;
  prompt: string;
  enhancedPrompt?: string;
  aspectRatio?: VideoAspectRatio;
  dataUrl: string;
  posterDataUrl?: string;
  mimeType: string;
  engine: string;
  fallbackPath: string[];
  durationSec?: number;
  requestedDurationSec?: number;
  durationNotice?: string;
  clientHfVideoFallback?: {
    prompt: string;
    durationSec: number;
    aspectRatio?: VideoAspectRatio;
    posterDataUrl?: string;
    posterRemoteUrl?: string;
    scenes?: VideoStoryboardScene[];
  };
  motionScript?: VideoMotionScript;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
  generatedImage?: GeneratedImageItem;
  generatedVideo?: GeneratedVideoItem;
  groundingSources?: GroundingSource[];
  engineUsed?: string;
  fallbackPath?: string[];
  errorNote?: string;
  isImageRequest?: boolean;
  isVideoRequest?: boolean;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  mode: WorkspaceMode;
  messages: ChatMessage[];
  updatedAt: number;
}
