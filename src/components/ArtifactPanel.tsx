import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Columns2,
  Copy,
  Download,
  Eye,
  Maximize2,
  Minimize2,
  Monitor,
  Moon,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Sun,
  Tablet,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import type { CodeArtifact } from '../types';

interface ArtifactPanelProps {
  artifact: CodeArtifact;
  allArtifacts: CodeArtifact[];
  onSelectArtifact: (artifact: CodeArtifact) => void;
  onUpdateArtifactCode?: (artifactId: string, newCode: string) => void;
  onClose: () => void;
  onRequestFix: (prompt: string) => void;
}

interface ConsoleEntry {
  level: 'log' | 'warn' | 'error';
  text: string;
  time: string;
}

function isCompiledPreviewLang(lang: string): boolean {
  const l = lang.toLowerCase().trim();
  return (
    l === 'tsx' ||
    l === 'jsx' ||
    l === 'react' ||
    l === 'ts' ||
    l === 'typescript' ||
    l === 'js' ||
    l === 'javascript'
  );
}

interface CompiledPreviewPayload {
  sourceKey: string;
  loading?: boolean;
  ok: boolean;
  compiledCode?: string;
  externalBundleJs?: string;
  externals?: string[];
  componentHint?: string;
  isReact?: boolean;
  error?: string;
}

function buildCompiledRequireHelper(hasThree: boolean, hasChart: boolean, hasD3: boolean): string {
  return `
    function __makeFallbackIcon(name) {
      return function LucideFallback(props) {
        const React = window.__KestrelReact;
        const size = (props && props.size) || 18;
        const strokeWidth = (props && props.strokeWidth) || 2;
        const className = (props && props.className) || '';
        const rest = Object.assign({}, props);
        delete rest.size; delete rest.strokeWidth; delete rest.className;
        return React.createElement('svg', Object.assign({
          xmlns: 'http://www.w3.org/2000/svg',
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: strokeWidth,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className: className,
          'data-icon': name,
        }, rest), React.createElement('circle', { cx: 12, cy: 12, r: 8 }));
      };
    }

    function __buildRequire(extCache) {
      const React = window.__KestrelReact;
      const ReactNs = window.__KestrelReactNs || React;
      const ReactMod = Object.assign({ __esModule: true, default: React }, ReactNs);
      const ReactDOM = window.__KestrelReactDOM || {};
      const ReactDOMMod = Object.assign({ __esModule: true, default: ReactDOM }, ReactDOM);
      const ReactDOMClient = window.__KestrelReactDOMClient || ReactDOM;
      const ReactDOMClientMod = Object.assign({ __esModule: true, default: ReactDOMClient }, ReactDOMClient);

      const lucideBase = window.__KestrelLucide || {};
      const lucideProxy = new Proxy(lucideBase, {
        get(target, prop) {
          if (prop === '__esModule') return true;
          if (prop === 'default') return target;
          if (typeof prop === 'string') {
            if (prop in target) return target[prop];
            const lower = prop.toLowerCase();
            for (const k of Object.keys(target)) {
              if (k.toLowerCase() === lower) return target[k];
            }
            return __makeFallbackIcon(prop);
          }
          return target[prop];
        }
      });

      const motionBase = window.__KestrelMotion || {};
      const motionProxy = motionBase.motion || new Proxy({}, {
        get(_, tag) {
          return React.forwardRef(function MotionEl(props, ref) {
            const clean = Object.assign({}, props);
            delete clean.initial; delete clean.animate; delete clean.exit;
            delete clean.transition; delete clean.variants; delete clean.whileHover;
            delete clean.whileTap; delete clean.whileInView; delete clean.viewport;
            delete clean.layout; delete clean.layoutId;
            return React.createElement(String(tag), Object.assign({ ref }, clean));
          });
        }
      });
      const motionMod = {
        __esModule: true,
        default: motionBase,
        motion: motionProxy,
        m: motionBase.m || motionProxy,
        AnimatePresence: motionBase.AnimatePresence || function(p){ return React.createElement(React.Fragment, null, p.children); },
        MotionConfig: motionBase.MotionConfig || function(p){ return React.createElement(React.Fragment, null, p.children); },
        useAnimation: motionBase.useAnimation || function(){ return { start: function(){ return Promise.resolve(); }, stop: function(){}, set: function(){} }; },
        useInView: motionBase.useInView || function(){ return true; },
        useScroll: motionBase.useScroll || function(){ return { scrollY: { get: function(){ return 0; } }, scrollYProgress: { get: function(){ return 0; } } }; },
        useTransform: motionBase.useTransform || function(v){ return v; },
        useSpring: motionBase.useSpring || function(v){ return v; },
        useMotionValue: motionBase.useMotionValue || function(v){ return { get: function(){ return v; }, set: function(){} }; },
      };
      Object.assign(motionMod, motionBase, { motion: motionProxy });

      const cssProxy = new Proxy({}, { get: (_, k) => String(k) });

      return function __kestrelRequire(id) {
        if (id === 'react') return ReactMod;
        if (id === 'react/jsx-runtime' || id === 'react/jsx-dev-runtime') return Object.assign({ __esModule: true }, window.__KestrelReactJsxRuntime || {});
        if (id === 'react-dom') return ReactDOMMod;
        if (id === 'react-dom/client') return ReactDOMClientMod;
        if (id === 'lucide-react') return lucideProxy;
        if (id === 'framer-motion' || id === 'motion/react') return motionMod;
        if (/\\.(?:css|scss|sass|less)$/i.test(id)) return cssProxy;
        if (window.__KestrelExtModules && id in window.__KestrelExtModules) {
          return Object.assign({ __esModule: true }, window.__KestrelExtModules[id]);
        }
        if (extCache && id in extCache) return extCache[id];
        ${hasThree ? "if (id === 'three' && window.THREE) return window.THREE;" : ''}
        ${hasChart ? "if ((id === 'chart.js' || id === 'chart.js/auto') && window.Chart) return Object.assign({ __esModule: true, default: window.Chart, Chart: window.Chart }, window.Chart);" : ''}
        ${hasD3 ? "if (id === 'd3' && window.d3) return window.d3;" : ''}
        if (id === 'clsx') return { __esModule: true, default: function(){ return Array.prototype.slice.call(arguments).flat().filter(Boolean).join(' '); }, clsx: function(){ return Array.prototype.slice.call(arguments).flat().filter(Boolean).join(' '); } };
        if (id.startsWith('./') || id.startsWith('../') || id.startsWith('@/')) return cssProxy;
        throw new Error('Cannot resolve module ' + id);
      };
    }
    window.__KestrelRequireBuiltin = __buildRequire(null);
  `;
}



function extractOuterTagContent(source: string, tagName: string): string | null {
  const openTagRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const firstOpen = openTagRe.exec(source);
  if (!firstOpen) return null;
  const contentStart = firstOpen.index + firstOpen[0].length;
  const tagTokenRe = new RegExp(`<(\\/)?${tagName}\\b[^>]*>`, 'gi');
  tagTokenRe.lastIndex = contentStart;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = tagTokenRe.exec(source)) !== null) {
    if (m[1]) {
      depth--;
      if (depth === 0) {
        return source.slice(contentStart, m.index);
      }
    } else if (!m[0].endsWith('/>')) {
      depth++;
    }
  }
  return null;
}

function collectTopLevelScriptSetupBindings(rawJs: string): string[] {
  const names = new Set<string>();
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let topLevelChunks: string[] = [];
  let chunk = '';

  for (let i = 0; i < rawJs.length; i++) {
    const ch = rawJs[i];
    const next = rawJs[i + 1] || '';

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        if (depth === 0) chunk += '\n';
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inSingle) {
      if (ch === '\\') { i++; continue; }
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inDouble = false;
      continue;
    }
    if (inTemplate) {
      if (ch === '\\') { i++; continue; }
      if (ch === '`') inTemplate = false;
      continue;
    }

    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === '`') { inTemplate = true; continue; }

    if (ch === '{') {
      if (depth === 0) {
        topLevelChunks.push(chunk + '{');
        chunk = '';
      }
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
      if (depth === 0) chunk = '';
    } else if (depth === 0) {
      chunk += ch;
    }
  }
  if (chunk.trim()) topLevelChunks.push(chunk);

  const topSrc = topLevelChunks.join('\n');
  for (const m of topSrc.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    names.add(m[1]);
  }
  for (const m of topSrc.matchAll(/\b(?:const|let|var)\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const cleaned = part.trim().split('=')[0]?.trim();
      if (!cleaned) continue;
      const renamed = cleaned.includes(':') ? cleaned.split(':').pop()?.trim() : cleaned;
      if (renamed && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(renamed)) {
        names.add(renamed);
      }
    }
  }
  for (const m of topSrc.matchAll(/\b(?:const|let|var)\s*\[([^\]]+)\]/g)) {
    for (const part of m[1].split(',')) {
      const cleaned = part.trim().replace(/^\.\.\./, '').split('=')[0]?.trim();
      if (cleaned && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(cleaned)) {
        names.add(cleaned);
      }
    }
  }
  return Array.from(names);
}

const TELEMETRY_HEAD_SCRIPT = `<script>
(function(){
  function makeMemoryStorage() {
    var store = Object.create(null);
    return {
      getItem: function(k) { return Object.prototype.hasOwnProperty.call(store, String(k)) ? store[String(k)] : null; },
      setItem: function(k, v) { store[String(k)] = String(v); },
      removeItem: function(k) { delete store[String(k)]; },
      clear: function() { store = Object.create(null); },
      key: function(i) { return Object.keys(store)[i] || null; },
      get length() { return Object.keys(store).length; }
    };
  }
  ['localStorage', 'sessionStorage'].forEach(function(prop) {
    try {
      var s = window[prop];
      s.setItem('__k_test__', '1');
      s.removeItem('__k_test__');
    } catch (e) {
      try {
        var mem = makeMemoryStorage();
        Object.defineProperty(window, prop, { configurable: true, enumerable: true, get: function(){ return mem; } });
      } catch (e2) {}
    }
  });
  try {
    if (window.history) {
      var origPush = window.history.pushState;
      var origReplace = window.history.replaceState;
      window.history.pushState = function() { try { return origPush.apply(window.history, arguments); } catch(e){} };
      window.history.replaceState = function() { try { return origReplace.apply(window.history, arguments); } catch(e){} };
    }
  } catch (e) {}
  window.alert = function(msg){ sendLog('log', ['[notice]', msg]); };
  window.confirm = function(){ return true; };
  function isBenignMsg(msg) {
    return /ResizeObserver loop|Script error\.|Non-Error promise|Failed to load resource|ERR_BLOCKED|cdn\\.tailwindcss\\.com/i.test(String(msg || ''));
  }
  var sendLog = function(level, args){
    try {
      var text = Array.prototype.slice.call(args).map(function(a){
        if (typeof a === 'object') { try { return JSON.stringify(a); } catch(e){ return String(a); } }
        return String(a);
      }).join(' ');
      if (isBenignMsg(text)) return;
      window.parent.postMessage({ type: 'kestrel-artifact-console', level: level, text: text }, '*');
    } catch(e){}
  };
  var oLog = console.log, oWarn = console.warn;
  console.log = function(){ sendLog('log', arguments); oLog.apply(console, arguments); };
  console.warn = function(){
    var first = String(arguments[0] || '');
    if (isBenignMsg(first)) return;
    sendLog('warn', arguments);
    oWarn.apply(console, arguments);
  };
  console.error = function(){ sendLog('log', arguments); };
  window.addEventListener('error', function(e){
    var msg = String(e.message || '');
    if (!msg || isBenignMsg(msg)) return;
    window.parent.postMessage({ type: 'kestrel-artifact-error', error: msg }, '*');
  });
  window.addEventListener('unhandledrejection', function(e){
    var msg = String(e.reason || '');
    if (!msg || isBenignMsg(msg)) return;
    window.parent.postMessage({ type: 'kestrel-artifact-error', error: msg }, '*');
  });
})();
</script>`;

export function buildPreviewSrcDoc(
  artifact: CodeArtifact,
  customCode?: string,
  canvasSurface: 'dark' | 'light' = 'dark',
  compiledPayload?: CompiledPreviewPayload | null
): string {
  const lang = artifact.language.toLowerCase();
  const code = customCode ?? artifact.code;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const bgColor = canvasSurface === 'light' ? '#FAFAF9' : '#09090B';
  const fgColor = canvasSurface === 'light' ? '#18181B' : '#F4F4F5';
  const cardBg = canvasSurface === 'light' ? '#FFFFFF' : '#111114';
  const borderCol =
    canvasSurface === 'light' ? 'rgba(24,24,27,0.1)' : 'rgba(255,255,255,0.09)';
  const dotCol =
    canvasSurface === 'light' ? 'rgba(24,24,27,0.08)' : 'rgba(255,255,255,0.07)';

  if (lang === 'mermaid') {
    const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: ${bgColor};
      background-image: radial-gradient(${dotCol} 1px, transparent 1px);
      background-size: 20px 20px;
      padding: 24px;
      color: ${fgColor};
      font-family: system-ui, -apple-system, sans-serif;
    }
    .mermaid svg { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div id="mermaid-target"></div>
  <script>
    (async function(){
      try {
        mermaid.initialize({ startOnLoad: false, theme: ${JSON.stringify(canvasSurface === 'light' ? 'default' : 'dark')}, securityLevel: 'strict' });
        const src = ${JSON.stringify(code)};
        const out = await mermaid.render('mermaid_svg_render', src);
        document.getElementById('mermaid-target').innerHTML = out.svg;
      } catch (e) {
        window.parent.postMessage({ type: 'kestrel-artifact-error', error: String(e && e.message ? e.message : e) }, '*');
        document.getElementById('mermaid-target').innerHTML = '<pre style="color:#94a3b8;font-size:13px">' + ${JSON.stringify(escaped)} + '</pre>';
      }
    })();
  </script>
</body>
</html>`;
  }

  if (lang === 'svg') {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: ${bgColor};
      background-image: radial-gradient(${dotCol} 1px, transparent 1px);
      background-size: 20px 20px;
      padding: 24px;
    }
    svg { max-width: 100%; max-height: 88vh; height: auto; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35); border-radius: 10px; background: white; }
  </style>
</head>
<body>${code}</body>
</html>`;
  }

  if (lang === 'latex' || lang === 'tex') {
    const safeTex = JSON.stringify(code).replace(/<\/script/gi, '<\\/script');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 36px 28px;
      background: ${bgColor};
      color: ${fgColor};
      font-family: Georgia, Cambria, 'Times New Roman', serif;
      line-height: 1.75;
    }
    .sheet {
      max-width: 720px;
      margin: 0 auto;
      padding: 28px 32px;
      background: ${cardBg};
      border: 1px solid ${borderCol};
      border-radius: 12px;
      font-size: 16px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div id="tex-sheet" class="sheet"></div>
  <script>
    try {
      const src = ${safeTex};
      const sheet = document.getElementById('tex-sheet');
      const hasDisplayDelims = /\\$\\$|\\$[^$\\n]+\\$|\\\\\\[|\\\\\\(|\\\\begin\\{/.test(src);
      if (hasDisplayDelims) {
        sheet.textContent = src;
        renderMathInElement(sheet, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\\\[', right: '\\\\]', display: true },
            { left: '\\\\(', right: '\\\\)', display: false },
          ],
          throwOnError: false,
        });
      } else {
        katex.render(src, sheet, { displayMode: true, throwOnError: false });
      }
    } catch (e) {
      window.parent.postMessage({ type: 'kestrel-artifact-error', error: String(e && e.message ? e.message : e) }, '*');
    }
  </script>
</body>
</html>`;
  }

  if (lang === 'diff' || lang === 'patch') {
    const safeDiff = JSON.stringify(code).replace(/<\/script/gi, '<\\/script');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 16px; background: #07090E; color: #E2E8F0; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12.5px; line-height: 1.55; }
    .diff-box { border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden; background: #0B0E14; }
    .dline { padding: 1px 12px; white-space: pre-wrap; word-break: break-word; border-left: 3px solid transparent; }
    .add { background: rgba(16, 185, 129, 0.12); color: #86EFAC; border-left-color: #10B981; }
    .del { background: rgba(239, 68, 68, 0.12); color: #FCA5A5; border-left-color: #EF4444; }
    .hunk { background: rgba(59, 130, 246, 0.12); color: #93C5FD; border-left-color: #3B82F6; font-weight: 600; padding-top: 4px; padding-bottom: 4px; }
    .meta { color: #94A3B8; background: rgba(255,255,255,0.03); font-weight: 600; }
  </style>
</head>
<body>
  <div id="diff-root" class="diff-box"></div>
  <script>
    const root = document.getElementById('diff-root');
    const lines = ${safeDiff}.split('\\n');
    for (const l of lines) {
      const div = document.createElement('div');
      let cls = 'dline';
      if (l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ') || l.startsWith('index ')) cls += ' meta';
      else if (l.startsWith('@@')) cls += ' hunk';
      else if (l.startsWith('+')) cls += ' add';
      else if (l.startsWith('-')) cls += ' del';
      div.className = cls;
      div.textContent = l || ' ';
      root.appendChild(div);
    }
  </script>
</body>
</html>`;
  }

  if (lang === 'vue') {
    const outerTemplate = extractOuterTagContent(code, 'template');
    const scriptSetupMatch = code.match(/<script\s+setup[^>]*>([\s\S]*?)<\/script>/i);
    const scriptMatch = code.match(/<script(?![^>]*setup)[^>]*>([\s\S]*?)<\/script>/i);
    const styleMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/i);

    const tplHtml = outerTemplate ? outerTemplate.trim() : '<div class="p-6">Vue Template</div>';
    const cssText = styleMatch ? styleMatch[1].replace(/<\/style/gi, '<\\/style') : '';
    const isSetup = Boolean(scriptSetupMatch);
    const rawJs = (scriptSetupMatch?.[1] || scriptMatch?.[1] || '')
      .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
      .trim();

    let componentScript = '';
    if (isSetup) {
      const expose = collectTopLevelScriptSetupBindings(rawJs).join(', ');
      componentScript = `
        const { ref, reactive, computed, watch, onMounted, onUnmounted } = Vue;
        const appDef = {
          template: ${JSON.stringify(tplHtml)},
          setup() {
            ${rawJs}
            return { ${expose} };
          }
        };
        Vue.createApp(appDef).mount('#app');
      `;
    } else if (rawJs) {
      const cleanedOpt = rawJs.replace(/export\s+default\s+/, 'const appDef = ');
      componentScript = `
        ${cleanedOpt}
        appDef.template = appDef.template || ${JSON.stringify(tplHtml)};
        Vue.createApp(appDef).mount('#app');
      `;
    } else {
      componentScript = `
        Vue.createApp({ template: ${JSON.stringify(tplHtml)} }).mount('#app');
      `;
    }

    const safeVueJs = JSON.stringify(componentScript).replace(/<\/script/gi, '<\\/script');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${TELEMETRY_HEAD_SCRIPT}
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { margin: 0; min-height: 100vh; font-family: system-ui, -apple-system, sans-serif; background: ${canvasSurface === 'light' ? '#ffffff' : '#0B0E14'}; color: ${fgColor}; }
    ${cssText}
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    try {
      const compiled = Babel.transform(${safeVueJs}, { presets: ['typescript'] }).code;
      (new Function(compiled))();
    } catch (e) {
      window.parent.postMessage({ type: 'kestrel-artifact-error', error: String(e && e.message ? e.message : e) }, '*');
    }
  </script>
</body>
</html>`;
  }

  if (lang === 'css' || lang === 'scss') {
    const safeCss = code.replace(/<\/style/gi, '<\\/style');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  ${TELEMETRY_HEAD_SCRIPT}
  <style>
    body { margin: 0; padding: 28px; font-family: system-ui, -apple-system, sans-serif; background: ${bgColor}; color: ${fgColor}; }
    .showcase-grid { max-width: 720px; margin: 0 auto; display: grid; gap: 18px; }
    .showcase-note { font-size: 12px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.08em; }
  </style>
  <style>${safeCss}</style>
</head>
<body>
  <div class="showcase-grid">
    <div class="showcase-note">Live CSS Stylesheet Preview</div>
    <div class="card">
      <h1>Heading &amp; Typography</h1>
      <h2>Secondary Section Title</h2>
      <p>Sample paragraph showing colors, spacing, border radius, and typography tokens from your stylesheet.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
        <button class="btn btn-primary button primary" type="button">Primary Action</button>
        <button class="btn btn-secondary button secondary" type="button">Secondary</button>
      </div>
    </div>
    <form class="card form" onsubmit="return false;">
      <label for="demo-in">Sample Input</label>
      <input id="demo-in" class="input" type="text" placeholder="Type to preview focus & input rules..." />
    </form>
  </div>
</body>
</html>`;
  }

  if (lang === 'csv' || lang === 'tsv') {
    const delim = lang === 'tsv' ? '\t' : ',';
    const safeRaw = JSON.stringify(code).replace(/<\/script/gi, '<\\/script');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: ${bgColor}; color: ${fgColor}; font-family: system-ui, -apple-system, sans-serif; font-size: 13px; }
    .meta { color: #94A3B8; font-family: ui-monospace, monospace; font-size: 12px; margin-bottom: 12px; }
    .wrap { overflow-x: auto; border: 1px solid ${borderCol}; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; background: ${cardBg}; }
    th, td { border-bottom: 1px solid ${borderCol}; border-right: 1px solid ${borderCol}; padding: 7px 10px; text-align: left; }
    th { background: rgba(59, 130, 246, 0.1); color: #60A5FA; font-weight: 600; position: sticky; top: 0; }
    tr:hover td { background: rgba(148,163,184,0.06); }
  </style>
</head>
<body>
  <div id="meta" class="meta"></div>
  <div class="wrap"><table id="tbl"></table></div>
  <script>
    (function(){
      function parseDelim(text, sep) {
        const rows = [];
        let row = [], cell = '', inQ = false;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (ch === '"') {
            if (inQ && text[i+1] === '"') { cell += '"'; i++; }
            else inQ = !inQ;
          } else if (ch === sep && !inQ) {
            row.push(cell); cell = '';
          } else if ((ch === '\\n' || ch === '\\r') && !inQ) {
            if (ch === '\\r' && text[i+1] === '\\n') i++;
            row.push(cell); rows.push(row); row = []; cell = '';
          } else {
            cell += ch;
          }
        }
        if (cell.length || row.length) { row.push(cell); rows.push(row); }
        return rows.filter(r => r.some(c => c.trim().length > 0));
      }
      const rows = parseDelim(${safeRaw}, ${JSON.stringify(delim)});
      const tbl = document.getElementById('tbl');
      if (rows.length > 0) {
        document.getElementById('meta').textContent = ${JSON.stringify(lang.toUpperCase())} + ' · ' + (rows.length - 1) + ' rows · ' + rows[0].length + ' columns';
        const thead = document.createElement('thead');
        const hr = document.createElement('tr');
        rows[0].forEach(h => { const th = document.createElement('th'); th.textContent = h; hr.appendChild(th); });
        thead.appendChild(hr);
        tbl.appendChild(thead);
        const tbody = document.createElement('tbody');
        rows.slice(1, 500).forEach(r => {
          const tr = document.createElement('tr');
          rows[0].forEach((_, ci) => { const td = document.createElement('td'); td.textContent = r[ci] ?? ''; tr.appendChild(td); });
          tbody.appendChild(tr);
        });
        tbl.appendChild(tbody);
      }
    })();
  </script>
</body>
</html>`;
  }

  if (lang === 'xml') {
    const safeXml = JSON.stringify(code).replace(/<\/script/gi, '<\\/script');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { margin: 0; padding: 20px; background: #0B0E14; color: #E2E8F0; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; line-height: 1.6; }
    details { margin-left: 16px; }
    summary { cursor: pointer; color: #60A5FA; }
    .attr { color: #FDBA74; } .text { color: #86EFAC; margin-left: 18px; }
  </style>
</head>
<body>
  <div id="xml-root"></div>
  <script>
    try {
      const doc = new DOMParser().parseFromString(${safeXml}, 'application/xml');
      const err = doc.querySelector('parsererror');
      if (err) throw new Error(err.textContent || 'Invalid XML');
      function renderEl(node) {
        if (node.nodeType === 3) {
          const t = node.textContent.trim();
          if (!t) return null;
          const d = document.createElement('div'); d.className = 'text'; d.textContent = t; return d;
        }
        if (node.nodeType !== 1) return null;
        const det = document.createElement('details'); det.open = true;
        const sum = document.createElement('summary');
        const attrs = Array.from(node.attributes || []).map(a => ' ' + a.name + '="' + a.value + '"').join('');
        sum.innerHTML = '&lt;' + node.tagName + '<span class="attr">' + attrs.replace(/</g, '&lt;') + '</span>&gt;';
        det.appendChild(sum);
        Array.from(node.childNodes).forEach(ch => { const el = renderEl(ch); if (el) det.appendChild(el); });
        return det;
      }
      const rootEl = renderEl(doc.documentElement);
      if (rootEl) document.getElementById('xml-root').appendChild(rootEl);
    } catch (e) {
      window.parent.postMessage({ type: 'kestrel-artifact-error', error: String(e && e.message ? e.message : e) }, '*');
    }
  </script>
</body>
</html>`;
  }

  if (lang === 'markdown' || lang === 'md') {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    body { margin: 0; padding: 32px; background: ${bgColor}; color: ${fgColor}; font-family: system-ui, -apple-system, sans-serif; line-height: 1.72; }
    article { max-width: 740px; margin: 0 auto; }
    h1, h2, h3 { margin-top: 1.4em; margin-bottom: 0.5em; }
    code { background: rgba(148,163,184,0.14); padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 0.9em; }
    pre { background: #111622; color: #E2E8F0; padding: 14px; border-radius: 8px; overflow-x: auto; border: 1px solid rgba(255,255,255,0.08); }
    pre code { background: none; padding: 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border: 1px solid ${borderCol}; padding: 8px 12px; text-align: left; }
    th { background: rgba(148,163,184,0.08); }
    blockquote { border-left: 3px solid #3B82F6; padding-left: 14px; opacity: 0.85; margin: 14px 0; }
  </style>
</head>
<body>
  <article id="md-out"></article>
  <script>
    try {
      document.getElementById('md-out').innerHTML = marked.parse(${JSON.stringify(code)});
    } catch (e) {
      window.parent.postMessage({ type: 'kestrel-artifact-error', error: String(e) }, '*');
    }
  </script>
</body>
</html>`;
  }

  if (lang === 'json' || lang === 'yaml' || lang === 'yml') {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #0B0E14; color: #E2E8F0; font-family: system-ui, -apple-system, sans-serif; font-size: 13px; }
    .meta { display: flex; gap: 12px; margin-bottom: 14px; color: #94A3B8; font-family: ui-monospace, monospace; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; background: #101521; border-radius: 8px; overflow: hidden; }
    th, td { border: 1px solid rgba(255,255,255,0.08); padding: 7px 10px; text-align: left; }
    th { background: #161C2C; color: #93C5FD; font-weight: 600; }
    details { margin-left: 14px; font-family: ui-monospace, monospace; line-height: 1.6; }
    summary { cursor: pointer; color: #60A5FA; }
    .leaf { margin-left: 16px; font-family: ui-monospace, monospace; line-height: 1.6; }
    .k { color: #93C5FD; } .v-str { color: #86EFAC; } .v-num { color: #FDBA74; } .v-bool { color: #C4B5FD; }
  </style>
</head>
<body>
  <div id="stats" class="meta"></div>
  <div id="table-view"></div>
  <div id="tree-view"></div>
  <script>
    try {
      const raw = ${JSON.stringify(code)};
      const data = ${JSON.stringify(lang)} === 'json' ? JSON.parse(raw) : jsyaml.load(raw);
      const statsEl = document.getElementById('stats');
      if (Array.isArray(data)) {
        statsEl.textContent = 'Array · ' + data.length + ' items';
        if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
          const cols = Array.from(new Set(data.slice(0, 40).flatMap(r => r && typeof r === 'object' ? Object.keys(r) : []))).slice(0, 10);
          if (cols.length > 0) {
            const tbl = document.createElement('table');
            tbl.innerHTML = '<thead><tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
              data.slice(0, 100).map(r => '<tr>' + cols.map(c => '<td>' + (r && r[c] !== undefined ? (typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c])) : '') + '</td>').join('') + '</tr>').join('') +
              '</tbody>';
            document.getElementById('table-view').appendChild(tbl);
          }
        }
      } else if (data && typeof data === 'object') {
        statsEl.textContent = 'Object · ' + Object.keys(data).length + ' top-level keys';
      } else {
        statsEl.textContent = typeof data;
      }
      function renderNode(key, val) {
        if (val && typeof val === 'object') {
          const d = document.createElement('details');
          d.open = true;
          const s = document.createElement('summary');
          s.textContent = (key !== null ? key + ': ' : '') + (Array.isArray(val) ? '[' + val.length + ']' : '{' + Object.keys(val).length + '}');
          d.appendChild(s);
          for (const [k, v] of Object.entries(val)) d.appendChild(renderNode(k, v));
          return d;
        }
        const div = document.createElement('div');
        div.className = 'leaf';
        const cls = typeof val === 'number' ? 'v-num' : typeof val === 'boolean' ? 'v-bool' : 'v-str';
        div.innerHTML = (key !== null ? '<span class="k">' + key + '</span>: ' : '') + '<span class="' + cls + '">' + JSON.stringify(val) + '</span>';
        return div;
      }
      document.getElementById('tree-view').appendChild(renderNode('root', data));
    } catch (e) {
      window.parent.postMessage({ type: 'kestrel-artifact-error', error: String(e && e.message ? e.message : e) }, '*');
    }
  </script>
</body>
</html>`;
  }

  if (lang === 'sql') {
    const safeSql = JSON.stringify(code).replace(/<\/script/gi, '<\\/script');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #0B0E14; color: #E2E8F0; font-family: system-ui, -apple-system, sans-serif; font-size: 13px; }
    .status { color: #94A3B8; font-family: ui-monospace, monospace; font-size: 12px; margin-bottom: 14px; }
    .block { margin-bottom: 18px; }
    .q-title { font-family: ui-monospace, monospace; font-size: 11px; color: #93C5FD; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; background: #101521; border: 1px solid rgba(255,255,255,0.08); }
    th, td { border: 1px solid rgba(255,255,255,0.08); padding: 7px 10px; text-align: left; }
    th { background: #161C2C; color: #E2E8F0; font-weight: 600; }
  </style>
</head>
<body>
  <div id="status" class="status">Initializing SQLite engine...</div>
  <div id="results"></div>
  <script>
    (async function(){
      try {
        const SQL = await initSqlJs({
          locateFile: f => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/' + f
        });
        const db = new SQL.Database();
        const sqlText = ${safeSql};
        const out = document.getElementById('results');
        const stmts = sqlText.split(/;\\s*(?=\\n|$)/).map(s => s.trim()).filter(Boolean);
        let tablesRendered = 0;
        for (const stmt of stmts) {
          const res = db.exec(stmt);
          if (res.length > 0) {
            for (const table of res) {
              tablesRendered++;
              const wrap = document.createElement('div');
              wrap.className = 'block';
              const qh = document.createElement('div');
              qh.className = 'q-title';
              qh.textContent = stmt.split('\\n')[0].slice(0, 90) + ' (' + table.values.length + ' rows)';
              wrap.appendChild(qh);
              const tbl = document.createElement('table');
              tbl.innerHTML = '<thead><tr>' + table.columns.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
                table.values.map(row => '<tr>' + row.map(v => '<td>' + (v === null ? 'NULL' : String(v)) + '</td>').join('') + '</tr>').join('') +
                '</tbody>';
              wrap.appendChild(tbl);
              out.appendChild(wrap);
            }
          }
        }
        document.getElementById('status').textContent = 'Executed ' + stmts.length + ' SQL statements · ' + tablesRendered + ' result set(s)';
      } catch (e) {
        document.getElementById('status').textContent = 'SQLite · Verifying query...';
        window.parent.postMessage({ type: 'kestrel-artifact-error', error: String(e && e.message ? e.message : e) }, '*');
      }
    })();
  </script>
</body>
</html>`;
  }

  if (lang === 'python' || lang === 'py') {
    const safePy = JSON.stringify(code).replace(/<\/script/gi, '<\\/script');
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #0B0E14; color: #E2E8F0; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; line-height: 1.55; }
    .bar { display: flex; justify-content: space-between; color: #94A3B8; font-size: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 12px; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; color: #E2E8F0; }
    .plots img { max-width: 100%; border-radius: 8px; margin-top: 12px; background: white; }
  </style>
</head>
<body>
  <div class="bar"><span id="py-status">Loading Python 3 runtime...</span><span id="py-time"></span></div>
  <pre id="py-out"></pre>
  <div id="py-plots" class="plots"></div>
  <script>
    (async function(){
      const outEl = document.getElementById('py-out');
      const statusEl = document.getElementById('py-status');
      const timeEl = document.getElementById('py-time');
      try {
        const t0 = performance.now();
        const pyodide = await loadPyodide({
          stdout: (txt) => { outEl.textContent += txt + '\\n'; window.parent.postMessage({ type: 'kestrel-artifact-console', level: 'log', text: txt }, '*'); },
          stderr: (txt) => { window.parent.postMessage({ type: 'kestrel-artifact-console', level: 'warn', text: txt }, '*'); },
        });
        const pyCode = ${safePy};
        if (/^\\s*(?:import|from)\\s+/m.test(pyCode)) {
          statusEl.textContent = 'Checking & loading Python modules...';
          try {
            await pyodide.loadPackagesFromImports(pyCode);
          } catch (e) {}
          try {
            const missingJson = await pyodide.runPythonAsync(
              'import ast, importlib.util, json, sys\\n' +
              '_ALIASES = {"bs4":"beautifulsoup4","pil":"pillow","sklearn":"scikit-learn","yaml":"pyyaml","dateutil":"python-dateutil","cv2":"opencv-python","crypto":"pycryptodome","dotenv":"python-dotenv"}\\n' +
              'def _k_missing(src):\\n' +
              '  try: tree = ast.parse(src)\\n' +
              '  except Exception: return []\\n' +
              '  mods = set()\\n' +
              '  for n in ast.walk(tree):\\n' +
              '    if isinstance(n, ast.Import):\\n' +
              '      for a in n.names: mods.add(a.name.split(".")[0])\\n' +
              '    elif isinstance(n, ast.ImportFrom) and n.module and n.level == 0:\\n' +
              '      mods.add(n.module.split(".")[0])\\n' +
              '  stdlib = getattr(sys, "stdlib_module_names", set())\\n' +
              '  out = []\\n' +
              '  for m in sorted(mods):\\n' +
              '    if not m or m in stdlib or m in ("js", "pyodide", "micropip"): continue\\n' +
              '    if importlib.util.find_spec(m) is None:\\n' +
              '      out.append(_ALIASES.get(m.lower(), m))\\n' +
              '  return out\\n' +
              'json.dumps(_k_missing(' + JSON.stringify(pyCode) + '))'
            );
            const missingList = JSON.parse(missingJson || '[]');
            if (Array.isArray(missingList) && missingList.length > 0) {
              statusEl.textContent = 'Installing Python packages (' + missingList.join(', ') + ')...';
              await pyodide.loadPackage('micropip');
              const micropip = pyodide.pyimport('micropip');
              for (const pkg of missingList) {
                try {
                  await micropip.install(pkg);
                } catch (pkgErr) {}
              }
            }
          } catch (e) {}
        }
        statusEl.textContent = 'Running Python 3...';
        window.__kestrelAddPlot = function(b64) {
          const img = document.createElement('img');
          img.src = 'data:image/png;base64,' + b64;
          document.getElementById('py-plots').appendChild(img);
        };
        await pyodide.runPythonAsync(
          'import builtins, io, base64\\n' +
          'builtins.input = lambda prompt="": ""\\n' +
          'try:\\n' +
          '  import matplotlib\\n' +
          '  matplotlib.use("Agg")\\n' +
          '  import matplotlib.pyplot as plt\\n' +
          '  import js\\n' +
          '  def _k_show(*a, **kw):\\n' +
          '    buf = io.BytesIO()\\n' +
          '    plt.savefig(buf, format="png", bbox_inches="tight", dpi=130)\\n' +
          '    buf.seek(0)\\n' +
          '    js.window.__kestrelAddPlot(base64.b64encode(buf.read()).decode("ascii"))\\n' +
          '    plt.close()\\n' +
          '  plt.show = _k_show\\n' +
          'except Exception:\\n' +
          '  pass\\n'
        );
        await pyodide.runPythonAsync(pyCode);
        statusEl.textContent = 'Python 3 · Completed';
        timeEl.textContent = Math.round(performance.now() - t0) + ' ms';
        if (!outEl.textContent.trim() && document.getElementById('py-plots').children.length === 0) {
          outEl.textContent = '(Program completed cleanly with no stdout output.)';
        }
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        statusEl.textContent = 'Python 3 · Preparing runtime...';
        window.parent.postMessage({ type: 'kestrel-artifact-py-fallback', error: msg }, '*');
      }
    })();
  </script>
</body>
</html>`;
  }

  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    if (!compiledPayload || compiledPayload.loading) {
      return `<!doctype html><html><head><meta charset="utf-8" /><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090B;color:#A1A1AA;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;}</style></head><body>Compiling ${lang.toUpperCase()} preview...</body></html>`;
    }
    const compiledJs = compiledPayload.compiledCode || '';
    const externalBundleJs = compiledPayload.externalBundleJs || '';
    const safeExternalBundle = externalBundleJs.replace(/<\/script/gi, '<\\/script');
    const externals = compiledPayload.externals || [];
    const extJson = JSON.stringify(externals).replace(/<\/script/gi, '<\\/script');
    const cjsJson = JSON.stringify(compiledJs).replace(/<\/script/gi, '<\\/script');
    const hasDomReact = Boolean(externalBundleJs) || /__KestrelReact|React\.createElement/.test(compiledJs);

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${TELEMETRY_HEAD_SCRIPT}
  ${hasDomReact ? `<script type="importmap">${JSON.stringify({
    imports: {
      react: `${origin}/vendor/esm/react.mjs`,
      'react/jsx-runtime': `${origin}/vendor/esm/react-jsx-runtime.mjs`,
      'react/jsx-dev-runtime': `${origin}/vendor/esm/react-jsx-runtime.mjs`,
      'react-dom': `${origin}/vendor/esm/react-dom.mjs`,
      'react-dom/client': `${origin}/vendor/esm/react-dom-client.mjs`,
    },
  })}</script>` : ''}
  ${hasDomReact ? `<script src="${origin}/vendor/kestrel-runtime.js"></script>` : ''}
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #09090B; color: #F4F4F5; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 13px; line-height: 1.55; }
    .bar { display: flex; justify-content: space-between; color: #A1A1AA; font-size: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 12px; }
    #dom-mount:not(:empty), #app:not(:empty), #root:not(:empty) { margin-bottom: 16px; padding: 14px; background: #111114; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); font-family: system-ui, sans-serif; }
    .line { padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.04); white-space: pre-wrap; }
    .warn { color: #FCD34D; } .err { color: #A1A1AA; }
  </style>
</head>
<body>
  <div class="bar"><span>${lang.toUpperCase()} Runner${externals.length ? ` · ${externals.length} pkg` : ''}</span><span id="js-time"></span></div>
  <div id="dom-mount"></div>
  <div id="app"></div>
  <div id="root"></div>
  <div id="console-out"></div>
  <script>
    ${buildCompiledRequireHelper(false, false, false)}
  </script>
  ${safeExternalBundle ? `<script>${safeExternalBundle}</script>` : ''}
  <script type="module">
    const out = document.getElementById('console-out');
    function addLine(cls, args) {
      const text = Array.prototype.slice.call(args).map(function(a){
        if (typeof a === 'object') { try { return JSON.stringify(a, null, 2); } catch(e){ return String(a); } }
        return String(a);
      }).join(' ');
      const div = document.createElement('div');
      div.className = 'line ' + cls;
      div.textContent = text;
      out.appendChild(div);
      window.parent.postMessage({ type: 'kestrel-artifact-console', level: cls === 'err' ? 'error' : cls === 'warn' ? 'warn' : 'log', text: text }, '*');
    }
    console.log = function(){ addLine('', arguments); };
    console.info = function(){ addLine('', arguments); };
    console.warn = function(){ addLine('warn', arguments); };
    console.error = function(){ addLine('err', arguments); };
    console.table = function(d){ addLine('', [JSON.stringify(d, null, 2)]); };

    (async function(){
      try {
        const t0 = performance.now();
        const externals = ${extJson};
        const extCache = Object.create(null);
        for (const pkg of externals) {
          if (window.__KestrelExtModules && pkg in window.__KestrelExtModules) continue;
          try {
            extCache[pkg] = await import('https://esm.sh/' + pkg);
          } catch (e) {}
        }
        const moduleObj = { exports: {} };
        const reqFn = __buildRequire(extCache);
        const React = window.__KestrelReact || {};
        const ReactDOM = window.__KestrelReactDOM || {};
        const fn = new Function('require', 'module', 'exports', 'React', 'ReactDOM', ${cjsJson});
        await fn(reqFn, moduleObj, moduleObj.exports, React, ReactDOM);
        if (moduleObj.exports && typeof moduleObj.exports.then === 'function') {
          await moduleObj.exports;
        }
        document.getElementById('js-time').textContent = Math.round(performance.now() - t0) + ' ms';
        if (!out.children.length && !document.getElementById('dom-mount').innerHTML && !document.getElementById('app').innerHTML && !document.getElementById('root').innerHTML) {
          addLine('', ['(Executed cleanly with no output.)']);
        }
      } catch (e) {
        window.parent.postMessage({ type: 'kestrel-artifact-node-fallback', error: String(e && e.message ? e.message : e) }, '*');
      }
    })();
  </script>
</body>
</html>`;
  }

  if (lang === 'html' || lang === 'htm') {
    const cleanHtmlInput = code
      .replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["'](?!https?:|data:|blob:|\/\/)[^"']+["'][^>]*>/gi, '')
      .replace(/<script[^>]+src=["'](?!https?:|data:|blob:|\/\/)[^"']+["'][^>]*>\s*<\/script>/gi, '');

    const usesTailwindClasses =
      /class=["'][^"']*\b(?:flex|grid|bg-|text-|p-|px-|py-|pt-|pb-|m-|mx-|my-|rounded-|shadow-|border-|gap-|space-[xy]-|items-|justify-|w-|h-|min-h-|max-w-)[^"']*["']/i.test(
        cleanHtmlInput
      );
    const hasTailwindTag = /tailwindcss/i.test(cleanHtmlInput);
    const hasStyleTag = /<style[\s>]/i.test(cleanHtmlInput);
    const tailwindInject =
      usesTailwindClasses && !hasTailwindTag
        ? '<script src="https://cdn.tailwindcss.com"></script>'
        : '';
    const baseStyleInject = !hasStyleTag
      ? `<style>*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5}</style>`
      : '';
    const headExtras = `${TELEMETRY_HEAD_SCRIPT}${tailwindInject}${baseStyleInject}`;

    const hasHtmlTag = /<html[\s>]/i.test(cleanHtmlInput);
    if (hasHtmlTag) {
      if (/<head[\s>]/i.test(cleanHtmlInput)) {
        return cleanHtmlInput.replace(/<head([^>]*)>/i, (_, attrs: string) => `<head${attrs}>${headExtras}`);
      }
      return cleanHtmlInput.replace(/<html([^>]*)>/i, (_, attrs: string) => `<html${attrs}><head>${headExtras}</head>`);
    }
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${TELEMETRY_HEAD_SCRIPT}
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background: ${canvasSurface === 'light' ? '#ffffff' : '#09090B'}; color: ${fgColor}; }
  </style>
</head>
<body>
  ${cleanHtmlInput}
</body>
</html>`;
  }

  // React JSX / TSX live runner: compiled cleanly by server-side esbuild + local React 19 / Lucide / Motion runtime (plus local ESM importmap for third-party npm packages)
  if (!compiledPayload || compiledPayload.loading) {
    return `<!doctype html><html><head><meta charset="utf-8" /><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${canvasSurface === 'light' ? '#ffffff' : '#09090B'};color:${canvasSurface === 'light' ? '#52525B' : '#A1A1AA'};font-family:system-ui,-apple-system,sans-serif;font-size:13px;}</style></head><body>Compiling interactive preview...</body></html>`;
  }

  const compiledCjs = compiledPayload.compiledCode || '';
  const externalBundleJs = compiledPayload.externalBundleJs || '';
  const safeExternalBundle = externalBundleJs.replace(/<\/script/gi, '<\\/script');
  const externals = compiledPayload.externals || [];
  const componentHint = compiledPayload.componentHint || 'App';
  const needsThree = externals.includes('three') && !externalBundleJs;
  const needsChartJs = externals.includes('chart.js') && !externalBundleJs;
  const needsD3 = externals.includes('d3') && !externalBundleJs;

  const reactHookNames = [
    'useState', 'useEffect', 'useLayoutEffect', 'useMemo', 'useRef', 'useCallback',
    'useReducer', 'useContext', 'createContext', 'Fragment', 'memo', 'forwardRef',
    'useId', 'useTransition', 'useDeferredValue', 'useImperativeHandle',
    'useSyncExternalStore', 'StrictMode', 'Suspense', 'Children', 'cloneElement',
    'isValidElement', 'createElement', 'createRef', 'Component', 'lazy', 'startTransition',
  ];
  const missingHooks = reactHookNames.filter(
    (h) => !new RegExp(`\\b(?:const|let|var|function|class)\\s+${h}\\b`).test(compiledCjs)
  );
  const hookDestructure = missingHooks.length
    ? `const { ${missingHooks.join(', ')} } = React;`
    : '';
  const createPortalDecl = !/\b(?:const|let|var|function)\s+createPortal\b/.test(compiledCjs)
    ? `const createPortal = ReactDOM.createPortal;`
    : '';

  const extJson = JSON.stringify(externals).replace(/<\/script/gi, '<\\/script');
  const cjsJson = JSON.stringify(compiledCjs).replace(/<\/script/gi, '<\\/script');
  const importMapObj = {
    imports: {
      react: `${origin}/vendor/esm/react.mjs`,
      'react/jsx-runtime': `${origin}/vendor/esm/react-jsx-runtime.mjs`,
      'react/jsx-dev-runtime': `${origin}/vendor/esm/react-jsx-runtime.mjs`,
      'react-dom': `${origin}/vendor/esm/react-dom.mjs`,
      'react-dom/client': `${origin}/vendor/esm/react-dom-client.mjs`,
    },
  };

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${TELEMETRY_HEAD_SCRIPT}
  <script type="importmap">${JSON.stringify(importMapObj)}</script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="${origin}/vendor/kestrel-runtime.js"></script>
  ${needsThree ? '<script src="https://unpkg.com/three@0.170.0/build/three.min.js"></script>' : ''}
  ${needsChartJs ? '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>' : ''}
  ${needsD3 ? '<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>' : ''}
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: ${canvasSurface === 'light' ? '#ffffff' : '#09090B'}; color: ${fgColor}; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    ${buildCompiledRequireHelper(needsThree, needsChartJs, needsD3)}
  </script>
  ${safeExternalBundle ? `<script>${safeExternalBundle}</script>` : ''}
  <script type="module">
    (async function(){
      try {
        const React = window.__KestrelReact;
        const ReactDOM = window.__KestrelReactDOM;
        const ReactDOMClient = window.__KestrelReactDOMClient || ReactDOM;
        if (!React || !ReactDOMClient) {
          throw new Error('Preview runtime did not finish initializing.');
        }
        window.React = React;
        window.ReactDOM = ReactDOM;

        const externals = ${extJson};
        const extCache = Object.create(null);
        await Promise.all(externals.map(async function(pkg) {
          if (window.__KestrelExtModules && pkg in window.__KestrelExtModules) return;
          try {
            extCache[pkg] = await import('https://esm.sh/' + pkg + '?external=react,react-dom,react-dom/client,react/jsx-runtime');
          } catch (err1) {
            try {
              extCache[pkg] = await import('https://esm.sh/' + pkg);
            } catch (err2) {}
          }
        }));

        const moduleObj = { exports: {} };
        const reqFn = __buildRequire(extCache);
        const runnerSrc = [
          ${JSON.stringify(hookDestructure)},
          ${JSON.stringify(createPortalDecl)},
          ${cjsJson},
          'const __kExports = module.exports || {};',
          'return (__kExports.default || (typeof __kExports === "function" ? __kExports : null) || (typeof ' + ${JSON.stringify(componentHint)} + ' !== "undefined" ? ' + ${JSON.stringify(componentHint)} + ' : (typeof App !== "undefined" ? App : null)));'
        ].join('\\n');

        const evalModule = new Function('require', 'module', 'exports', 'React', 'ReactDOM', runnerSrc);
        const TargetComp = evalModule(reqFn, moduleObj, moduleObj.exports, React, ReactDOM);
        if (!TargetComp) {
          throw new Error('No root React component found to mount.');
        }

        class __KestrelBoundary extends React.Component {
          constructor(p){ super(p); this.state = { hasError: false }; }
          static getDerivedStateFromError(){ return { hasError: true }; }
          componentDidCatch(err){ window.parent.postMessage({ type: 'kestrel-artifact-error', error: String(err && err.message ? err.message : err) }, '*'); }
          render(){ return this.state.hasError ? null : this.props.children; }
        }

        const root = ReactDOMClient.createRoot(document.getElementById('root'));
        root.render(React.createElement(__KestrelBoundary, null, React.createElement(TargetComp)));
      } catch (err) {
        window.parent.postMessage({ type: 'kestrel-artifact-error', error: String(err && err.message ? err.message : err) }, '*');
      }
    })();
  </script>
</body>
</html>`;
}

const NATIVE_SERVER_EXEC_LANGS = new Set([
  'bash',
  'sh',
  'shell',
  'zsh',
  'c',
  'cpp',
  'c++',
  'cc',
]);

const PYTHON_STDLIB_SET = new Set([
  'abc', 'argparse', 'array', 'ast', 'asyncio', 'base64', 'bisect', 'builtins',
  'cmath', 'collections', 'contextlib', 'copy', 'csv', 'dataclasses', 'datetime',
  'decimal', 'difflib', 'enum', 'errno', 'fractions', 'functools', 'gc', 'glob',
  'hashlib', 'heapq', 'hmac', 'html', 'http', 'importlib', 'inspect', 'io',
  'itertools', 'json', 'keyword', 'logging', 'math', 'numbers', 'operator', 'os',
  'pathlib', 'pickle', 'platform', 'pprint', 'queue', 'random', 're', 'secrets',
  'shutil', 'signal', 'socket', 'sqlite3', 'statistics', 'string', 'struct',
  'subprocess', 'sys', 'tempfile', 'textwrap', 'threading', 'time', 'timeit',
  'traceback', 'types', 'typing', 'unicodedata', 'unittest', 'urllib', 'uuid',
  'warnings', 'weakref', 'xml', 'zipfile', 'zlib',
]);

function usesServerExecution(lang: string, code: string): boolean {
  const l = lang.toLowerCase().trim();
  if (NATIVE_SERVER_EXEC_LANGS.has(l)) return true;
  if (l === 'python' || l === 'py') {
    const modMatches = [...code.matchAll(/^\s*(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm)];
    for (const m of modMatches) {
      if (!PYTHON_STDLIB_SET.has(m[1])) {
        return false; // Run third-party modules via Pyodide with automatic package download & micropip
      }
    }
    return true;
  }
  return false;
}

interface ServerExecState {
  running: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  runtime: string;
  durationMs: number;
  autoFixing?: boolean;
}

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({
  artifact,
  allArtifacts,
  onSelectArtifact,
  onUpdateArtifactCode,
  onClose,
  onRequestFix,
}) => {
  const [tab, setTab] = useState<'preview' | 'split' | 'code'>(
    artifact.previewable ? 'preview' : 'code'
  );
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewZoom, setPreviewZoom] = useState<75 | 100 | 125>(100);
  const [canvasSurface, setCanvasSurface] = useState<'light' | 'dark'>('light');
  const [isEditing, setIsEditing] = useState(false);
  const [draftCode, setDraftCode] = useState(artifact.code);
  const [appliedCode, setAppliedCode] = useState(artifact.code);

  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleFilter, setConsoleFilter] = useState<'all' | 'log' | 'error'>('all');
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [serverExec, setServerExec] = useState<ServerExecState | null>(null);
  const [compiledPreview, setCompiledPreview] = useState<CompiledPreviewPayload | null>(null);

  const autoFixCountByArtifactRef = useRef<Record<string, number>>({});
  const activeArtifactRef = useRef(artifact);
  const appliedCodeRef = useRef(appliedCode);
  const isAutoFixingRef = useRef(false);
  const lastArtifactIdRef = useRef(artifact.id);
  activeArtifactRef.current = artifact;
  appliedCodeRef.current = appliedCode;

  useEffect(() => {
    const isNewArtifact = lastArtifactIdRef.current !== artifact.id;
    lastArtifactIdRef.current = artifact.id;
    if (isNewArtifact) {
      setTab(artifact.previewable ? 'preview' : 'code');
      setIsEditing(false);
      setConsoleLogs([]);
      setServerExec(null);
      setCompiledPreview(null);
    }
    setDraftCode(artifact.code);
    setAppliedCode(artifact.code);
  }, [artifact.id, artifact.code, artifact.previewable]);

  const runSilentAutoFix = useCallback(
    async (errorText: string): Promise<boolean> => {
      const curArt = activeArtifactRef.current;
      const isFatalRuntime =
        /\b(?:SyntaxError|ReferenceError|TypeError|RangeError|Unexpected|is not defined|is not a function|No root React component|Expected|Missing|Unterminated|no such table|syntax error|NameError|IndentationError|ImportError|ModuleNotFoundError|ZeroDivisionError|undefined reference|command not found|exit status|Cannot resolve module)\b|error:/i.test(
          errorText
        );
      const attempts = autoFixCountByArtifactRef.current[curArt.id] || 0;
      if (!isFatalRuntime || attempts >= 2 || isAutoFixingRef.current) {
        return false;
      }

      autoFixCountByArtifactRef.current[curArt.id] = attempts + 1;
      isAutoFixingRef.current = true;

      try {
        const resp = await fetch('/api/auto-fix-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: curArt.language,
            code: appliedCodeRef.current,
            error: errorText,
            title: curArt.title,
          }),
        });
        if (!resp.ok) return false;
        const data = (await resp.json()) as { fixedCode?: string | null };
        if (data.fixedCode && data.fixedCode.trim() !== appliedCodeRef.current.trim()) {
          setDraftCode(data.fixedCode);
          setAppliedCode(data.fixedCode);
          onUpdateArtifactCode?.(curArt.id, data.fixedCode);
          setConsoleLogs([]);
          setReloadNonce((n) => n + 1);
          return true;
        }
      } catch {
        // remain completely quiet
      } finally {
        isAutoFixingRef.current = false;
      }
      return false;
    },
    [onUpdateArtifactCode]
  );

  // Automatic in-app server compilation & execution (C, C++, Bash, standard Python, plus fallback for JS/TS/Pyodide)
  const runServerExecution = useCallback(
    async (langOverride?: string, signal?: AbortSignal) => {
      const curArt = activeArtifactRef.current;
      const execLang = (langOverride || curArt.language).toLowerCase();
      setServerExec({
        running: true,
        stdout: '',
        stderr: '',
        exitCode: null,
        runtime: execLang.toUpperCase(),
        durationMs: 0,
      });

      try {
        const resp = await fetch('/api/execute-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: execLang,
            code: appliedCodeRef.current,
          }),
          signal,
        });
        if (signal?.aborted) return;
        const data = (await resp.json()) as {
          stdout?: string;
          stderr?: string;
          exitCode?: number;
          runtime?: string;
          durationMs?: number;
        };
        const exitCode = typeof data.exitCode === 'number' ? data.exitCode : 0;
        const stdout = data.stdout || '';
        const stderr = data.stderr || '';

        if (exitCode !== 0 && stderr.trim()) {
          setServerExec({
            running: false,
            stdout,
            stderr,
            exitCode,
            runtime: data.runtime || execLang.toUpperCase(),
            durationMs: data.durationMs || 0,
            autoFixing: true,
          });
          const fixed = await runSilentAutoFix(stderr);
          if (fixed || signal?.aborted) return;
        }

        const timeLabel = new Date().toLocaleTimeString();
        const combinedOut = (stdout || '').trim();
        if (combinedOut) {
          setConsoleLogs(
            combinedOut
              .split('\n')
              .slice(0, 60)
              .map((line) => ({ level: 'log' as const, text: line, time: timeLabel }))
          );
        }

        setServerExec({
          running: false,
          stdout,
          stderr,
          exitCode,
          runtime: data.runtime || execLang.toUpperCase(),
          durationMs: data.durationMs || 0,
          autoFixing: false,
        });
      } catch {
        if (!signal?.aborted) {
          setServerExec((prev) =>
            prev ? { ...prev, running: false, autoFixing: false } : null
          );
        }
      }
    },
    [runSilentAutoFix]
  );

  const isNativeServerExec =
    artifact.previewable && usesServerExecution(artifact.language, appliedCode);
  const needsServerCompile =
    artifact.previewable && !isNativeServerExec && isCompiledPreviewLang(artifact.language);

  useEffect(() => {
    if (!needsServerCompile) {
      setCompiledPreview(null);
      return;
    }

    const sourceKey = `${artifact.id}:${reloadNonce}:${appliedCode}`;
    const ctrl = new AbortController();
    setCompiledPreview({ sourceKey, loading: true, ok: false });

    (async () => {
      try {
        const resp = await fetch('/api/compile-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: artifact.language,
            code: appliedCode,
            title: artifact.title,
          }),
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        const data = (await resp.json()) as {
          ok?: boolean;
          compiledCode?: string;
          repairedCode?: string | null;
          externalBundleJs?: string;
          externals?: string[];
          componentHint?: string;
          isReact?: boolean;
          error?: string;
        };
        if (ctrl.signal.aborted) return;

        if (data.repairedCode && data.repairedCode.trim() !== appliedCode.trim()) {
          setDraftCode(data.repairedCode);
          setAppliedCode(data.repairedCode);
          onUpdateArtifactCode?.(artifact.id, data.repairedCode);
        }

        if (data.ok && data.compiledCode) {
          setCompiledPreview({
            sourceKey,
            loading: false,
            ok: true,
            compiledCode: data.compiledCode,
            externalBundleJs: data.externalBundleJs || '',
            externals: data.externals || [],
            componentHint: data.componentHint || 'App',
            isReact: Boolean(data.isReact),
          });
        } else {
          setCompiledPreview({
            sourceKey,
            loading: false,
            ok: false,
            error: data.error || 'Compilation incomplete',
          });
        }
      } catch {
        if (!ctrl.signal.aborted) {
          setCompiledPreview({ sourceKey, loading: false, ok: false });
        }
      }
    })();

    return () => ctrl.abort();
  }, [
    needsServerCompile,
    artifact.id,
    artifact.language,
    artifact.title,
    appliedCode,
    reloadNonce,
    onUpdateArtifactCode,
  ]);

  useEffect(() => {
    if (!isNativeServerExec) {
      setServerExec(null);
      return;
    }
    const ctrl = new AbortController();
    void runServerExecution(artifact.language, ctrl.signal);
    return () => ctrl.abort();
  }, [
    isNativeServerExec,
    artifact.id,
    artifact.language,
    appliedCode,
    reloadNonce,
    runServerExecution,
  ]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'kestrel-artifact-py-fallback') {
        void runServerExecution('python');
        return;
      }
      if (event.data?.type === 'kestrel-artifact-node-fallback') {
        const msg = String(event.data.error || '');
        if (/\b(?:require|process|module|__dirname|__filename|Buffer|Cannot resolve module)\b/i.test(msg)) {
          void runServerExecution(activeArtifactRef.current.language);
        } else {
          void runSilentAutoFix(msg);
        }
        return;
      }
      if (event.data?.type === 'kestrel-artifact-error') {
        const msg = String(event.data.error || '');
        if (!msg || /ResizeObserver|Script error\./i.test(msg)) return;
        setConsoleLogs((prev) => [
          ...prev.slice(-60),
          { level: 'log', text: msg, time: new Date().toLocaleTimeString() },
        ]);
        void runSilentAutoFix(msg);
      } else if (event.data?.type === 'kestrel-artifact-console') {
        const level =
          event.data.level === 'warn' || event.data.level === 'error'
            ? (event.data.level as 'warn' | 'error')
            : 'log';
        setConsoleLogs((prev) => [
          ...prev.slice(-60),
          {
            level,
            text: String(event.data.text || ''),
            time: new Date().toLocaleTimeString(),
          },
        ]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [runSilentAutoFix, runServerExecution]);

  const srcDoc = useMemo(() => {
    if (!artifact.previewable || isNativeServerExec) return '';
    return buildPreviewSrcDoc(artifact, appliedCode, canvasSurface, compiledPreview);
  }, [artifact, appliedCode, canvasSurface, reloadNonce, isNativeServerExec, compiledPreview]);

  const handleApplyEdit = useCallback(
    (switchToPreview = false) => {
      autoFixCountByArtifactRef.current[artifact.id] = 0;
      setAppliedCode(draftCode);
      onUpdateArtifactCode?.(artifact.id, draftCode);
      setConsoleLogs([]);
      setReloadNonce((n) => n + 1);
      if (switchToPreview && artifact.previewable) {
        setTab('preview');
      }
    },
    [artifact.id, artifact.previewable, draftCode, onUpdateArtifactCode]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draftCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = (asStandaloneHtml = false) => {
    const extMap: Record<string, string> = {
      html: 'html',
      htm: 'html',
      jsx: 'jsx',
      tsx: 'tsx',
      vue: 'vue',
      svg: 'svg',
      python: 'py',
      py: 'py',
      typescript: 'ts',
      ts: 'ts',
      javascript: 'js',
      js: 'js',
      css: 'css',
      sql: 'sql',
      json: 'json',
      yaml: 'yaml',
      yml: 'yml',
      markdown: 'md',
      md: 'md',
      latex: 'tex',
      tex: 'tex',
      diff: 'diff',
      patch: 'patch',
      xml: 'xml',
      csv: 'csv',
      tsv: 'tsv',
      bash: 'sh',
      sh: 'sh',
      shell: 'sh',
      c: 'c',
      cpp: 'cpp',
      'c++': 'cpp',
      cc: 'cpp',
    };
    const slug = artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (asStandaloneHtml && artifact.previewable) {
      const htmlContent = buildPreviewSrcDoc(artifact, appliedCode, canvasSurface, compiledPreview);
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}.html`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const ext = extMap[artifact.language.toLowerCase()] || 'txt';
    const mime =
      ext === 'svg'
        ? 'image/svg+xml;charset=utf-8'
        : 'text/plain;charset=utf-8';
    const blob = new Blob([draftCode], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lines = draftCode.split('\n');
  const hasUnsavedEdits = draftCode !== appliedCode;
  const filteredConsoleLogs = useMemo(() => {
    if (consoleFilter === 'all') return consoleLogs;
    if (consoleFilter === 'error') {
      return consoleLogs.filter((l) => l.level === 'error' || l.level === 'warn');
    }
    return consoleLogs.filter((l) => l.level === 'log');
  }, [consoleLogs, consoleFilter]);

  const viewportWidthClass =
    viewport === 'mobile'
      ? 'w-[390px] max-w-full shadow-2xl border-x border-zinc-200 dark:border-white/[0.1]'
      : viewport === 'tablet'
        ? 'w-[768px] max-w-full shadow-2xl border-x border-zinc-200 dark:border-white/[0.1]'
        : 'w-full';

  const showingPreview = (tab === 'preview' || tab === 'split') && artifact.previewable;
  const showingCode = tab === 'code' || tab === 'split' || !artifact.previewable;

  const renderCodeStage = (editableMode: boolean) =>
    editableMode ? (
      <textarea
        value={draftCode}
        onChange={(e) => setDraftCode(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            handleApplyEdit(false);
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            const start = e.currentTarget.selectionStart;
            const end = e.currentTarget.selectionEnd;
            const next = draftCode.slice(0, start) + '  ' + draftCode.slice(end);
            setDraftCode(next);
            requestAnimationFrame(() => {
              e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
            });
          }
        }}
        spellCheck={false}
        aria-label="Edit artifact code"
        className="w-full h-full p-4 bg-[#09090B] text-zinc-100 font-mono text-[12.5px] leading-relaxed focus:outline-none resize-none"
      />
    ) : (
      <div className="w-full h-full overflow-auto bg-[#09090B] text-zinc-100 p-4 font-mono text-[12.5px] leading-relaxed">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className="hover:bg-white/[0.03]">
                <td className="select-none pr-4 text-right text-zinc-600 tabular-nums align-top w-10">
                  {i + 1}
                </td>
                <td className="whitespace-pre text-zinc-100">{line || ' '}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <aside
      className={`flex flex-col min-w-0 overflow-hidden bg-white dark:bg-[#0C0C0F] border-l border-zinc-200 dark:border-white/[0.08] ${
        expanded
          ? 'fixed inset-0 z-50'
          : 'fixed inset-0 z-40 lg:static lg:inset-auto lg:z-auto lg:w-[49%] xl:w-[52%] shrink-0 h-full'
      }`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-zinc-200 dark:border-white/[0.07] bg-zinc-50/90 dark:bg-[#111114] shrink-0 min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {allArtifacts.length > 1 ? (
            <select
              value={artifact.id}
              onChange={(e) => {
                const found = allArtifacts.find((a) => a.id === e.target.value);
                if (found) onSelectArtifact(found);
              }}
              aria-label="Select artifact"
              className="text-xs font-medium bg-white dark:bg-[#18181B] border border-zinc-200 dark:border-white/[0.1] rounded-lg px-2 py-1.5 text-zinc-900 dark:text-zinc-100 truncate max-w-full w-full sm:max-w-[195px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
            >
              {allArtifacts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.language})
                </option>
              ))}
            </select>
          ) : (
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                {artifact.title}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate">
                {artifact.language} · <span className="tabular-nums">{lines.length}</span> lines
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {artifact.previewable && (
            <div className="flex items-center p-0.5 rounded-lg bg-zinc-200/75 dark:bg-[#18181B] border border-transparent dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() => setTab('preview')}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === 'preview'
                    ? 'bg-white dark:bg-[#27272A] text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Preview</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('split');
                  setIsEditing(true);
                }}
                title="Split code & live preview"
                className={`hidden md:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === 'split'
                    ? 'bg-white dark:bg-[#27272A] text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Split</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('code')}
                className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  tab === 'code'
                    ? 'bg-white dark:bg-[#27272A] text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Code</span>
              </button>
            </div>
          )}

          {showingPreview && (
            <>
              <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-zinc-200/60 dark:bg-[#18181B] ml-0.5">
                <button
                  type="button"
                  onClick={() => setViewport('desktop')}
                  title="Desktop viewport"
                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                    viewport === 'desktop'
                      ? 'bg-white dark:bg-[#27272A] text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('tablet')}
                  title="Tablet viewport (768px)"
                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                    viewport === 'tablet'
                      ? 'bg-white dark:bg-[#27272A] text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Tablet className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewport('mobile')}
                  title="Mobile viewport (390px)"
                  className={`p-1 rounded-md transition-colors cursor-pointer ${
                    viewport === 'mobile'
                      ? 'bg-white dark:bg-[#27272A] text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  setPreviewZoom((z) => (z === 100 ? 75 : z === 75 ? 125 : 100))
                }
                title="Cycle preview zoom (75% / 100% / 125%)"
                className="hidden xl:inline-flex items-center px-1.5 py-1 rounded-md text-[11px] font-mono tabular-nums text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                {previewZoom}%
              </button>

              <button
                type="button"
                onClick={() =>
                  setCanvasSurface((s) => (s === 'light' ? 'dark' : 'light'))
                }
                title={`Switch preview backdrop to ${canvasSurface === 'light' ? 'dark' : 'light'}`}
                className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                {canvasSurface === 'light' ? (
                  <Moon className="w-3.5 h-3.5" />
                ) : (
                  <Sun className="w-3.5 h-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setConsoleLogs([]);
                  setReloadNonce((n) => n + 1);
                }}
                title="Re-run preview"
                className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {tab === 'code' && (
            <button
              type="button"
              onClick={() => setIsEditing((v) => !v)}
              title={isEditing ? 'Switch to read view' : 'Edit code live'}
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isEditing
                  ? 'bg-[#0D9488]/15 text-[#0D9488] dark:text-[#2DD4BF]'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-white/[0.06]'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isEditing ? 'Editing' : 'Edit'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            title="Copy code"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden xl:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => handleDownload(false)}
            title="Download source file"
            className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Exit fullscreen' : 'Fullscreen'}
            className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            {expanded ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Close artifact panel"
            className="p-1.5 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Live Edit Action Strip */}
      {showingCode && hasUnsavedEdits && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#0D9488]/10 border-b border-[#0D9488]/20 text-xs">
          <span className="text-zinc-700 dark:text-zinc-200 font-medium">
            Local changes ready <span className="hidden sm:inline text-zinc-500 dark:text-zinc-400 font-mono">(Ctrl/⌘+S to run)</span>
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setDraftCode(appliedCode)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Revert
            </button>
            {artifact.previewable && (
              <button
                type="button"
                onClick={() => handleApplyEdit(tab === 'code')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#0D9488] hover:bg-[#0F766E] text-white font-medium cursor-pointer"
              >
                <Play className="w-3 h-3" />
                Run in Preview
              </button>
            )}
          </div>
        </div>
      )}

      {/* Viewport / Split / Code Stage */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-zinc-100 dark:bg-[#09090B]">
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {tab === 'split' && artifact.previewable ? (
            <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-zinc-200 dark:divide-white/[0.08] min-h-0">
              <div className="min-h-0 min-w-0 h-full overflow-hidden">
                {renderCodeStage(true)}
              </div>
              <div className="min-h-0 min-w-0 h-full flex justify-center overflow-auto">
                {serverExec ? (
                  <div className={`flex flex-col h-full bg-[#09090B] text-zinc-100 font-mono text-[13px] ${viewportWidthClass}`}>
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.08] bg-[#111114] text-xs text-zinc-400">
                      <span className="inline-flex items-center gap-2 text-zinc-200 font-medium">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        {serverExec.runtime}
                      </span>
                      <span className="tabular-nums">
                        {serverExec.autoFixing
                          ? 'Auto-correcting...'
                          : serverExec.running
                            ? 'Running...'
                            : `${serverExec.durationMs} ms`}
                      </span>
                    </div>
                    <pre className="flex-1 p-4 overflow-auto whitespace-pre-wrap break-words leading-relaxed text-zinc-100 m-0">
                      {serverExec.running || serverExec.autoFixing
                        ? 'Compiling and executing in Kestrel sandbox...'
                        : serverExec.stdout.trim() ||
                          (serverExec.exitCode === 0
                            ? '(Completed cleanly with no stdout output.)'
                            : serverExec.stderr.trim() || '(Finished execution.)')}
                    </pre>
                  </div>
                ) : (
                  <iframe
                    key={`${artifact.id}_${reloadNonce}_${canvasSurface}_${compiledPreview?.ok ? 'r' : compiledPreview?.loading ? 'l' : 'd'}`}
                    title={artifact.title}
                    srcDoc={srcDoc}
                    sandbox="allow-scripts allow-forms allow-modals"
                    style={
                      previewZoom !== 100
                        ? {
                            transform: `scale(${previewZoom / 100})`,
                            transformOrigin: 'top center',
                            width:
                              viewport === 'mobile'
                                ? '390px'
                                : viewport === 'tablet'
                                  ? '768px'
                                  : `${10000 / previewZoom}%`,
                            height: `${10000 / previewZoom}%`,
                          }
                        : undefined
                    }
                    className={`block h-full border-0 transition-all duration-200 ${
                      canvasSurface === 'light' ? 'bg-white' : 'bg-[#09090B]'
                    } ${viewportWidthClass}`}
                  />
                )}
              </div>
            </div>
          ) : showingPreview ? (
            <div className="flex-1 min-h-0 flex justify-center overflow-auto">
              {serverExec ? (
                <div className={`flex flex-col h-full bg-[#09090B] text-zinc-100 font-mono text-[13px] ${viewportWidthClass}`}>
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.08] bg-[#111114] text-xs text-zinc-400">
                    <span className="inline-flex items-center gap-2 text-zinc-200 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      {serverExec.runtime}
                    </span>
                    <span className="tabular-nums">
                      {serverExec.autoFixing
                        ? 'Auto-correcting...'
                        : serverExec.running
                          ? 'Running...'
                          : `${serverExec.durationMs} ms`}
                    </span>
                  </div>
                  <pre className="flex-1 p-4 overflow-auto whitespace-pre-wrap break-words leading-relaxed text-zinc-100 m-0">
                    {serverExec.running || serverExec.autoFixing
                      ? 'Compiling and executing in Kestrel sandbox...'
                      : serverExec.stdout.trim() ||
                        (serverExec.exitCode === 0
                          ? '(Completed cleanly with no stdout output.)'
                          : serverExec.stderr.trim() || '(Finished execution.)')}
                  </pre>
                </div>
              ) : (
                <iframe
                  key={`${artifact.id}_${reloadNonce}_${canvasSurface}_${compiledPreview?.ok ? 'r' : compiledPreview?.loading ? 'l' : 'd'}`}
                  title={artifact.title}
                  srcDoc={srcDoc}
                  sandbox="allow-scripts allow-forms allow-modals"
                  style={
                    previewZoom !== 100
                      ? {
                          transform: `scale(${previewZoom / 100})`,
                          transformOrigin: 'top center',
                          width:
                            viewport === 'mobile'
                              ? '390px'
                              : viewport === 'tablet'
                                ? '768px'
                                : `${10000 / previewZoom}%`,
                          height: `${10000 / previewZoom}%`,
                        }
                      : undefined
                  }
                  className={`block h-full border-0 transition-all duration-200 ${
                    canvasSurface === 'light' ? 'bg-white' : 'bg-[#09090B]'
                  } ${viewportWidthClass}`}
                />
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden">{renderCodeStage(isEditing)}</div>
          )}
        </div>

        {/* Collapsible Runtime Console */}
        {showingPreview && consoleOpen && (
          <div className="h-40 shrink-0 border-t border-zinc-200 dark:border-white/[0.08] bg-[#09090B] text-zinc-200 flex flex-col">
            <div className="px-3 py-1.5 border-b border-white/[0.07] flex items-center justify-between gap-2 text-[11px] text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="font-mono text-zinc-300">Runtime console</span>
                <div className="flex items-center gap-1 ml-1">
                  {(['all', 'log', 'error'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setConsoleFilter(f)}
                      className={`px-1.5 py-0.5 rounded capitalize transition-colors cursor-pointer ${
                        consoleFilter === f
                          ? 'bg-white/12 text-white'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {f === 'error' ? 'notices' : f}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConsoleLogs([])}
                className="hover:text-white cursor-pointer"
              >
                Clear
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs space-y-1">
              {filteredConsoleLogs.length === 0 ? (
                <div className="text-zinc-500">No console messages in this view.</div>
              ) : (
                filteredConsoleLogs.map((entry, idx) => (
                  <div
                    key={idx}
                    className={
                      entry.level === 'error'
                        ? 'text-zinc-300'
                        : entry.level === 'warn'
                          ? 'text-amber-300'
                          : 'text-zinc-300'
                    }
                  >
                    <span className="text-zinc-600 mr-2 tabular-nums">
                      [{entry.time}]
                    </span>
                    {entry.text}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Toolbar + External Environment Launchers */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-t border-zinc-200 dark:border-white/[0.07] bg-zinc-50/90 dark:bg-[#111114] text-xs text-zinc-500 dark:text-zinc-400 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2.5 shrink-0">
          {showingPreview && (
            <button
              type="button"
              onClick={() => setConsoleOpen((v) => !v)}
              className={`inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-white cursor-pointer tabular-nums ${
                consoleOpen ? 'text-[#0D9488] dark:text-[#2DD4BF]' : ''
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Console ({consoleLogs.length})
            </button>
          )}
          {!showingPreview && (
            <span className="font-mono text-[11px]">{artifact.language.toUpperCase()}</span>
          )}
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {artifact.previewable && !isNativeServerExec && artifact.language !== 'html' && artifact.language !== 'htm' && (
            <button
              type="button"
              onClick={() => handleDownload(true)}
              className="hidden sm:inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-300 hover:underline whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3 h-3" />
              Export HTML
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              onRequestFix(
                `Upgrade and refine "${artifact.title}" (${artifact.language}): improve interactivity, visual polish, and edge cases.`
              )
            }
            className="inline-flex items-center gap-1 text-[#0D9488] dark:text-[#2DD4BF] hover:underline font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5" />
            Refine
          </button>
        </div>
      </div>
    </aside>
  );
};
