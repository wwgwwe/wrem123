import React, { useMemo, useState, useEffect } from 'react';
import type { GeneratedImage } from '../types';
import { DownloadIcon, TrashIcon, ChevronDownIcon } from './icons';

// These are expected to be available globally from the scripts in index.html
declare const JSZip: any;
declare const saveAs: any;

interface HistoryPanelProps {
  history: GeneratedImage[];
  onImageClick: (image: GeneratedImage) => void;
  clearHistory: () => void;
  deleteFolder: (folderName: string) => void;
}

const HistoryItem: React.FC<{ image: GeneratedImage, onClick: () => void }> = ({ image, onClick }) => {
    const date = new Date(image.timestamp);
    const dateString = `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        const data = JSON.stringify({
            id: image.id,
            src: image.src,
            name: image.name,
        });
        e.dataTransfer.setData('application/x-ai-toolset-history-item', data);
        e.dataTransfer.effectAllowed = 'copy';
    };
    
    return (
        <div 
            onClick={onClick} 
            draggable="true"
            onDragStart={handleDragStart}
            className="w-full text-left bg-[var(--bg-tertiary)] rounded-lg overflow-hidden group relative transition-transform transform hover:scale-105 cursor-grab"
        >
            <img src={image.src} alt={image.name} className="w-full h-24 object-cover" draggable="false" />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-300"></div>
            <p className="text-xs text-center p-1 bg-[var(--bg-secondary)] truncate" title={image.name}>{dateString}</p>
        </div>
    );
};


export const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, onImageClick, clearHistory, deleteFolder }) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    const styleId = 'history-panel-animation-style';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes fade-in {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fade-in {
        animation: fade-in 0.3s ease-out;
      }
    `;
    document.head.append(style);
  }, []);

  const groupedHistory = useMemo(() => {
    return history.reduce((acc, image) => {
      const folder = image.folder || 'Uncategorized';
      if (!acc[folder]) {
        acc[folder] = [];
      }
      acc[folder].push(image);
      return acc;
    }, {} as Record<string, GeneratedImage[]>);
  }, [history]);

  const toggleFolder = (folderName: string) => {
    setExpandedFolders(prev => {
        const newSet = new Set(prev);
        if (newSet.has(folderName)) {
            newSet.delete(folderName);
        } else {
            newSet.add(folderName);
        }
        return newSet;
    });
  };
  
  const handleDownloadAll = async () => {
    if (history.length === 0) return;

    const zip = new JSZip();
    // Fix: Use Object.keys to iterate over groupedHistory to preserve type information.
    // Object.entries was causing the 'images' variable to be typed as 'unknown'.
    const folderPromises = Object.keys(groupedHistory).map(async (folderName) => {
      const images = groupedHistory[folderName];
      const folder = zip.folder(folderName);
      if(folder){
        const imagePromises = images.map(async (image) => {
          const fileName = `${image.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`;
          try {
            const response = await fetch(image.src);
            const blob = await response.blob();
            folder.file(fileName, blob);
          } catch(e) {
            console.error(`Failed to fetch and add ${image.name} to zip`, e);
          }
        });
        await Promise.all(imagePromises);
      }
    });

    await Promise.all(folderPromises);
    
    zip.generateAsync({ type: 'blob' }).then((content: any) => {
      saveAs(content, `ai_toolset_export_${Date.now()}.zip`);
    });
  };

  const handleDownloadFolder = async (folderName: string, images: GeneratedImage[]) => {
    if (images.length === 0) return;

    const zip = new JSZip();
    const imagePromises = images.map(async (image) => {
      const fileName = `${image.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`;
      try {
        const response = await fetch(image.src);
        const blob = await response.blob();
        zip.file(fileName, blob);
      } catch(e) {
        console.error(`Failed to fetch and add ${image.name} to zip`, e);
      }
    });
    
    await Promise.all(imagePromises);
    
    zip.generateAsync({ type: 'blob' }).then((content: any) => {
      const safeFolderName = folderName.toLowerCase().replace(/[^a-z0-9]/g, '_');
      saveAs(content, `export_${safeFolderName}.zip`);
    });
  };

  return (
    <aside className="w-72 bg-[var(--bg-secondary)] p-4 flex flex-col border-l border-[var(--border-primary)] h-full">
      <div className="flex-shrink-0">
        <h2 className="text-xl font-bold mb-4 text-[var(--text-accent)]">작업 기록</h2>
        <div className="grid grid-cols-2 gap-2 mb-4">
            <button 
              onClick={handleDownloadAll}
              disabled={history.length === 0}
              className="w-full bg-[var(--bg-accent)] text-[var(--text-on-accent)] font-bold py-2 px-4 rounded-lg hover:bg-[var(--bg-accent-hover)] transition-colors disabled:bg-[var(--bg-disabled)] disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              <DownloadIcon className="w-5 h-5" />
              전체 다운로드
            </button>
            <button
              onClick={clearHistory}
              disabled={history.length === 0}
              className="w-full bg-[var(--bg-negative)] text-[var(--text-on-accent)] font-bold py-2 px-4 rounded-lg hover:bg-[var(--bg-negative-hover)] transition-colors disabled:bg-[var(--bg-disabled)] disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
              <TrashIcon className="w-5 h-5" />
              기록 비우기
            </button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto space-y-2 pr-1">
        {/* Fix: Use Object.keys to iterate over groupedHistory to preserve type information.
            This resolves errors where `images` was typed as 'unknown', preventing use of `.map()` and causing assignment issues. */}
        {Object.keys(groupedHistory).length > 0 ? Object.keys(groupedHistory).map((folder) => {
          const images = groupedHistory[folder];
          const isExpanded = expandedFolders.has(folder);
          return (
          <div key={folder} className="bg-[var(--bg-tertiary)]/50 rounded-lg">
            <button onClick={() => toggleFolder(folder)} className="w-full flex items-center justify-between font-semibold text-[var(--text-primary)] p-2 rounded-lg hover:bg-[var(--bg-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring-accent)]">
              <span className="truncate text-left">{folder}</span>
              <ChevronDownIcon className={`w-5 h-5 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
            {isExpanded && (
                <div className="p-2 animate-fade-in">
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleDownloadFolder(folder, images); }}
                        className="w-full bg-[var(--bg-info)] text-[var(--text-on-accent)] font-bold py-1.5 px-2 rounded-md hover:bg-[var(--bg-info-hover)] transition-colors flex items-center justify-center gap-1 text-xs"
                    >
                        <DownloadIcon className="w-4 h-4" />
                        폴더 다운로드
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); deleteFolder(folder); }}
                        className="w-full bg-[var(--bg-negative)] text-[var(--text-on-accent)] font-bold py-1.5 px-2 rounded-md hover:bg-[var(--bg-negative-hover)] transition-colors flex items-center justify-center gap-1 text-xs"
                    >
                        <TrashIcon className="w-4 h-4" />
                        폴더 삭제
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {images.map(image => (
                      <HistoryItem 
                          key={image.id} 
                          image={image}
                          onClick={() => onImageClick(image)}
                      />
                    ))}
                  </div>
                </div>
            )}
          </div>
        )}) : (
          <div className="flex items-center justify-center h-full">
             <p className="text-[var(--text-secondary)] text-center">생성된 이미지가 여기에 표시됩니다.</p>
          </div>
        )}
      </div>
    </aside>
  );
};