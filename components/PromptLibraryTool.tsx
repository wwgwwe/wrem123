import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { creativeAndUtility } from '../data/prompts/creativeAndUtility';
import { objectsAndProducts } from '../data/prompts/objectsAndProducts';
import { peopleAndCharacters } from '../data/prompts/peopleAndCharacters';
import { scenesAndEnvironments } from '../data/prompts/scenesAndEnvironments';
import { stylesAndEffects } from '../data/prompts/stylesAndEffects';
import type { Category, Case, GeneratedImage } from '../types';
import { fileToBase64 } from '../utils/fileUtils';
import { editImageWithNanoBanana, regeneratePromptVariation } from '../services/geminiService';
import { CloseIcon, SparklesIcon } from './icons';

const ALL_CATEGORIES: Category[] = [
    peopleAndCharacters,
    objectsAndProducts,
    scenesAndEnvironments,
    stylesAndEffects,
    creativeAndUtility,
];

const CaseCard: React.FC<{ caseItem: Case, onSelect: () => void }> = ({ caseItem, onSelect }) => {
    return (
        <button
            onClick={onSelect}
            className="bg-[var(--bg-secondary)] rounded-lg p-4 flex flex-col h-full shadow-lg border border-[var(--border-primary)] hover:border-[var(--border-accent)] hover:bg-[var(--bg-secondary)]/50 transition-all text-left"
        >
            <h3 className="text-lg font-bold text-[var(--text-accent)] mb-2">{caseItem.name}</h3>
            <p className="text-sm text-[var(--text-primary)] flex-grow mb-3">{caseItem.description}</p>
            <p className="text-xs text-[var(--text-secondary)] mb-3"><span className="font-semibold">💡 팁:</span> {caseItem.suggestionHint}</p>
            <div className="mt-auto pt-3 border-t border-[var(--border-primary)]">
                <a href={caseItem.href} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--border-accent)] hover:underline" onClick={(e) => e.stopPropagation()}>
                    Author: {caseItem.author}
                </a>
            </div>
        </button>
    );
};

interface PromptLibraryToolProps {
  addToHistory: (image: GeneratedImage) => void;
  onImageClick: (image: GeneratedImage) => void;
}

export const PromptLibraryTool: React.FC<PromptLibraryToolProps> = ({ addToHistory, onImageClick }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sourceImage, setSourceImage] = useState<{ data: string; mime: string; url: string } | null>(null);
    const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
    const [currentPrompt, setCurrentPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRegeneratingPrompt, setIsRegeneratingPrompt] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const processFile = useCallback(async (file: File) => {
        if (file && file.type.startsWith('image/')) {
            try {
                const { base64, mimeType } = await fileToBase64(file);
                setSourceImage({ data: base64, mime: mimeType, url: `data:${mimeType};base64,${base64}` });
                setGeneratedImage(null);
                setError(null);
            } catch (err) {
                setError("이미지 파일을 불러올 수 없습니다.");
            }
        } else {
            setError("유효한 이미지 파일을 업로드해주세요.");
        }
    }, []);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) await processFile(file);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingOver(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
        }
    };

    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        const file = items[i].getAsFile();
                        if(file) processFile(file);
                        break;
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [processFile]);

    const handleSelectPrompt = (prompt: string) => {
        setCurrentPrompt(prompt);
    };
    
    const handleGenerate = async () => {
        if (!sourceImage) {
            setError("이미지를 먼저 업로드해주세요.");
            return;
        }
        if (!currentPrompt.trim()) {
            setError("프롬프트를 입력하거나 라이브러리에서 선택해주세요.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setGeneratedImage(null);

        try {
            const newImageSrc = await editImageWithNanoBanana(sourceImage.data, sourceImage.mime, currentPrompt);
            const timestamp = Date.now();
            const date = new Date(timestamp);
            const folderName = `프롬프트_라이브러리_${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
            
            const resultImage: GeneratedImage = {
                id: `${timestamp}-result`,
                src: newImageSrc,
                name: 'Generated Image',
                folder: folderName,
                timestamp: timestamp,
            };
            
            addToHistory(resultImage);
            setGeneratedImage(resultImage);

        } catch (err) {
            console.error("Generation failed:", err);
            setError("이미지 생성에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleRegeneratePrompt = async () => {
        if (!sourceImage || !currentPrompt.trim()) {
            setError("재생성을 위해 이미지와 프롬프트가 모두 필요합니다.");
            return;
        }
        
        setIsRegeneratingPrompt(true);
        setError(null);

        try {
            const newPrompt = await regeneratePromptVariation(sourceImage.data, sourceImage.mime, currentPrompt);
            setCurrentPrompt(newPrompt);
        } catch (err) {
            console.error("Failed to regenerate prompt:", err);
            setError("프롬프트 재생성에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsRegeneratingPrompt(false);
        }
    };

    const filteredCategories = useMemo(() => {
        if (!searchTerm.trim()) return ALL_CATEGORIES;

        const lowercasedFilter = searchTerm.toLowerCase();
        
        return ALL_CATEGORIES.map(category => {
            const filteredCases = category.cases.filter(caseItem => 
                caseItem.name.toLowerCase().includes(lowercasedFilter) ||
                caseItem.description.toLowerCase().includes(lowercasedFilter) ||
                caseItem.prompt.toLowerCase().includes(lowercasedFilter)
            );
            return { ...category, cases: filteredCases };
        }).filter(category => category.cases.length > 0);

    }, [searchTerm]);

    return (
        <div className="h-full flex flex-col gap-6">
            <div className="flex-shrink-0 grid grid-cols-1 lg:grid-cols-2 gap-6 bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
                {/* Image Uploader */}
                <div 
                    className={`h-[450px] flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-lg p-4 transition-colors ${isDraggingOver ? 'border-[var(--border-accent)] bg-[var(--bg-tertiary)]/50' : 'border-[var(--border-secondary)]'}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {sourceImage ? (
                        <div className="relative w-full h-full">
                            <img src={sourceImage.url} alt="Uploaded" className="max-h-full max-w-full w-full h-full object-contain rounded" />
                            <button onClick={() => setSourceImage(null)} className="absolute top-2 right-2 bg-[var(--bg-primary)] p-1.5 rounded-full hover:bg-[var(--bg-tertiary)]">
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <h3 className="text-lg font-semibold text-center">이미지를 업로드하세요</h3>
                            <label htmlFor="lib-file-upload" className="cursor-pointer bg-[var(--bg-accent)] text-[var(--text-on-accent)] font-bold py-2 px-4 rounded-lg hover:bg-[var(--bg-accent-hover)] transition-colors">
                                이미지 선택
                            </label>
                            <input id="lib-file-upload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                            <p className="text-sm text-[var(--text-secondary)] mt-1">또는 드래그 앤 드롭, 붙여넣기</p>
                        </>
                    )}
                </div>
                
                {/* Prompt & Result */}
                <div className="flex flex-col gap-4">
                    <div className="flex-grow flex flex-col">
                        <div className="flex justify-between items-center mb-2">
                            <label htmlFor="prompt-input" className="block text-md font-medium text-[var(--text-primary)]">프롬프트 [수정가능]</label>
                            <button
                                onClick={handleRegeneratePrompt}
                                disabled={isLoading || isRegeneratingPrompt || !sourceImage || !currentPrompt.trim()}
                                className="bg-[var(--bg-info)] text-[var(--text-on-accent)] font-bold py-1.5 px-3 rounded-lg hover:bg-[var(--bg-info-hover)] transition-colors disabled:bg-[var(--bg-disabled)] disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                            >
                                {isRegeneratingPrompt ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                ) : (
                                    <SparklesIcon className="w-4 h-4" />
                                )}
                                {isRegeneratingPrompt ? '재생성 중...' : '프롬프트 재생성'}
                            </button>
                        </div>
                        <textarea
                            id="prompt-input"
                            rows={5}
                            value={currentPrompt}
                            onChange={(e) => setCurrentPrompt(e.target.value)}
                            placeholder="라이브러리에서 케이스를 클릭하여 프롬프트를 불러오세요..."
                            className="flex-grow w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-3 text-sm focus:ring-[var(--ring-accent)] focus:border-[var(--border-accent)]"
                        />
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !sourceImage}
                        className="bg-[var(--bg-positive)] text-[var(--text-on-accent)] font-bold py-3 px-4 rounded-lg hover:bg-[var(--bg-positive-hover)] transition-colors disabled:bg-[var(--bg-disabled)]"
                    >
                         {isLoading ? '생성 중...' : '생성하기'}
                    </button>
                    {error && <p className="text-[var(--bg-negative)] text-center">{error}</p>}
                    <div className="h-48 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-center relative group">
                        {isLoading && <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--border-accent)]"></div>}
                        {generatedImage && !isLoading && (
                            <button onClick={() => onImageClick(generatedImage)} className="w-full h-full">
                                <img src={generatedImage.src} alt="Generated result" className="w-full h-full object-contain rounded-lg p-1" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all">
                                    <p className="text-white text-lg font-bold opacity-0 group-hover:opacity-100 transition-opacity">클릭해서 보기</p>
                                </div>
                            </button>
                        )}
                        {!generatedImage && !isLoading && <p className="text-[var(--text-secondary)]">결과가 여기에 표시됩니다</p>}
                    </div>
                </div>
            </div>

            {/* Library Section */}
            <div className="flex-grow flex flex-col bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl overflow-hidden">
                <input
                    type="text"
                    placeholder="라이브러리 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-3 mb-4 text-md focus:ring-[var(--ring-accent)] focus:border-[var(--border-accent)]"
                />
                <div className="flex-grow overflow-y-auto pr-2 space-y-8">
                    {filteredCategories.length > 0 ? (
                        filteredCategories.map(category => (
                            <div key={category.name}>
                                <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-4 pb-2 border-b-2 border-[var(--border-primary)]">{category.name}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {category.cases.map(caseItem => (
                                        <CaseCard key={caseItem.id} caseItem={caseItem} onSelect={() => handleSelectPrompt(caseItem.prompt)} />
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-10">
                            <p className="text-lg text-[var(--text-secondary)]">검색 결과가 없습니다.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};