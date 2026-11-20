import React, { useMemo, useState } from 'react';
import {
  Code2,
  MessageSquare,
  Moon,
  PanelLeftClose,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import type { Conversation, WorkspaceMode } from '../types';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string;
  mode: WorkspaceMode;
  darkMode: boolean;
  isOpenMobile: boolean;
  isCollapsedDesktop: boolean;
  onCloseMobile: () => void;
  onToggleCollapseDesktop: () => void;
  onModeChange: (mode: WorkspaceMode) => void;
  onToggleDarkMode: () => void;
  onSelect: (id: string) => void;
  onNewSession: (mode?: WorkspaceMode) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

const MODE_ITEMS: Array<{
  id: WorkspaceMode;
  label: string;
  Icon: React.FC<{ className?: string }>;
}> = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'code', label: 'Code', Icon: Code2 },
];

export const BrandMark: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M4 17.5L11.5 4L14.5 9.5L20 6.5L13 20L9.5 14L4 17.5Z"
      fill="currentColor"
      fillOpacity="0.92"
    />
  </svg>
);

export const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  activeId,
  mode,
  darkMode,
  isOpenMobile,
  isCollapsedDesktop,
  onCloseMobile,
  onToggleCollapseDesktop,
  onModeChange,
  onToggleDarkMode,
  onSelect,
  onNewSession,
  onDelete,
  onClearAll,
}) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  }, [conversations, query]);

  const content = (
    <div className="flex flex-col h-full w-[256px] bg-[#F3F3F1] dark:bg-[#0C0C0F] border-r border-zinc-200/80 dark:border-white/[0.07] select-none">
      {/* Top Row: Brand Mark + Collapse */}
      <div className="h-13 px-4 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5 text-zinc-900 dark:text-zinc-100">
          <div className="w-6 h-6 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center shrink-0">
            <BrandMark className="w-3.5 h-3.5" />
          </div>
          <span className="font-display text-[15px] font-semibold tracking-tight whitespace-nowrap">
            Kestrel
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleCollapseDesktop}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          className="hidden lg:inline-flex p-1.5 rounded-lg text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close sidebar"
          className="lg:hidden p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* New Session */}
      <div className="px-3 pb-2.5">
        <button
          type="button"
          onClick={() => {
            onNewSession();
            onCloseMobile();
          }}
          className="w-full px-3 py-2 rounded-lg flex items-center gap-2 text-[13px] font-medium bg-white dark:bg-[#141418] hover:bg-zinc-50 dark:hover:bg-[#1A1A1F] border border-zinc-200/90 dark:border-white/[0.08] text-zinc-900 dark:text-zinc-100 transition-colors whitespace-nowrap cursor-pointer shadow-2xs dark:shadow-none"
        >
          <Plus className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF]" />
          <span>New session</span>
        </button>
      </div>

      {/* Mode Switcher */}
      <nav className="px-3 pb-3.5">
        <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-zinc-200/75 dark:bg-white/[0.04] border border-zinc-200/60 dark:border-white/[0.05]">
          {MODE_ITEMS.map(({ id, label, Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onModeChange(id);
                  onCloseMobile();
                }}
                className={`px-2.5 py-1.5 rounded-md flex items-center justify-center gap-2 text-[12.5px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-white dark:bg-[#1D1D22] text-zinc-900 dark:text-white shadow-2xs dark:shadow-none'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[#0D9488] dark:text-[#2DD4BF]' : 'opacity-75'}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions"
            aria-label="Search sessions"
            className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg bg-black/[0.04] dark:bg-white/[0.04] border border-transparent focus:border-[#0D9488]/50 dark:focus:border-[#2DD4BF]/50 focus:bg-white dark:focus:bg-[#141418] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none transition-colors"
          />
        </div>
      </div>

      {/* Recent Sessions */}
      <div className="px-4 pt-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Sessions
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 pb-2 space-y-0.5">
        {filtered.length === 0 ? (
          <p className="px-2.5 py-4 text-xs text-zinc-400 dark:text-zinc-500">
            {query ? 'No matches' : 'No recent sessions'}
          </p>
        ) : (
          filtered.map((conv) => {
            const active = conv.id === activeId;
            return (
              <div
                key={conv.id}
                className={`group relative flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors ${
                  active
                    ? 'bg-zinc-200/80 dark:bg-white/[0.08] text-zinc-900 dark:text-white font-medium'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] hover:text-zinc-900 dark:hover:text-zinc-200'
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-[#0D9488] dark:bg-[#2DD4BF]"
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    onSelect(conv.id);
                    onCloseMobile();
                  }}
                  className="flex-1 min-w-0 flex items-center gap-2 text-left text-[13px] cursor-pointer"
                >
                  {conv.mode === 'code' ? (
                    <Code2 className="w-3.5 h-3.5 shrink-0 opacity-65" />
                  ) : (
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-65" />
                  )}
                  <span className="truncate">{conv.title || 'New session'}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                  aria-label={`Delete ${conv.title}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-zinc-400 hover:text-red-500 transition-opacity shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Quiet Footer */}
      <div className="p-2.5 border-t border-zinc-200/75 dark:border-white/[0.06] flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleDarkMode}
          className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.05] transition-colors cursor-pointer"
        >
          {darkMode ? (
            <>
              <Sun className="w-3.5 h-3.5" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5" />
              <span>Dark</span>
            </>
          )}
        </button>

        {conversations.length > 1 && (
          <button
            type="button"
            onClick={onClearAll}
            className="px-2.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {!isCollapsedDesktop && (
        <div className="hidden lg:block h-full shrink-0">{content}</div>
      )}

      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
};
