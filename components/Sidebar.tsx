import React from 'react';
import { TOOLS } from '../constants';
import type { ToolId } from '../types';
import type { Theme } from './themes';

interface SidebarProps {
  activeToolId: ToolId;
  setActiveToolId: (id: ToolId) => void;
  themes: Theme[];
  activeTheme: Theme;
  setTheme: (theme: Theme) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeToolId, setActiveToolId, themes, activeTheme, setTheme }) => {
  return (
    <aside className="w-64 bg-[var(--bg-secondary)] p-4 flex flex-col border-r border-[var(--border-primary)]">
      <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-8">AI 도구 모음</h1>
      <nav className="flex flex-col space-y-2">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            onClick={() => setActiveToolId(tool.id)}
            className={`flex items-center space-x-3 p-3 rounded-lg text-left transition-all duration-200 ${
              activeToolId === tool.id
                ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)] shadow-lg'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <tool.icon className="w-6 h-6" />
            <span className="font-medium">{tool.name}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto pt-4 border-t border-[var(--border-primary)] space-y-4">
        <div>
            <label htmlFor="theme-select" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">테마 선택</label>
            <select
            id="theme-select"
            value={activeTheme.id}
            onChange={(e) => {
                const selectedTheme = themes.find(t => t.id === e.target.value);
                if (selectedTheme) setTheme(selectedTheme);
            }}
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-2 text-[var(--text-primary)] focus:ring-[var(--ring-accent)] focus:border-[var(--border-accent)]"
            >
            {themes.map(theme => (
                <option key={theme.id} value={theme.id}>{theme.name}</option>
            ))}
            </select>
        </div>
        
        <a 
          href="https://linktr.ee/sculpt_ai" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center justify-center p-3 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-all duration-200"
        >
          <span className="font-bold text-lg">Sculpt_ai</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-2" fill="none" viewBox="0 0 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </aside>
  );
};