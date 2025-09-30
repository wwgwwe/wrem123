import React, { useState, useCallback, useEffect } from 'react';
import { fileToBase64 } from '../utils/fileUtils';
import { generateBackgroundAndPropsImage, generatePromptForBgProp } from '../services/geminiService';
import type { GeneratedImage, BgPropImage } from '../types';
import { CloseIcon, SparklesIcon } from './icons';

// Re-usable ImageUploader component
const ImageUploader: React.FC<{
    title: string;
    image: { url: string } | null;
    onFileSelect: (file: File) => void;
    onClear: () => void;
    className?: string;
}> = ({ title, image, onFileSelect, onClear, className = 'h-64' }) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            onFileSelect(e.target.files[0]);
        }
        e.target.value = '';
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
        const file = e.dataTransfer.files[0];
        if (file) {
            onFileSelect(file);
        }
    };

    const inputId = `file-upload-${title.replace(/\s/g, '-')}`;

    return (
        <div className="flex flex-col items-center">
            <h3 className="text-xl font-bold mb-2">{title}</h3>
            <div 
                className={`w-full ${className} bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-center border-2 border-dashed ${isDraggingOver ? 'border-[var(--border-accent)] bg-[var(--bg-interactive)]' : 'border-[var(--border-secondary)]'} transition-colors relative`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {image ? (
                    <>
                        <img src={image.url} alt={title} className="w-full h-full object-contain rounded-md p-2" />
                        <button onClick={onClear} className="absolute top-2 right-2 bg-[var(--bg-primary)]/70 text-white rounded-full p-1.5 hover:bg-[var(--bg-negative)] transition-colors">
                            <CloseIcon className="w-4 h-4" />
                        </button>
                    </>
                ) : (
                    <p className="text-[var(--text-secondary)] text-sm text-center p-2">드래그, 드롭, 또는 붙여넣기</p>
                )}
            </div>
            <label htmlFor={inputId} className="cursor-pointer bg-[var(--bg-interactive)] text-[var(--text-primary)] font-bold py-2 px-4 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors mt-3 text-sm">
                이미지 선택
            </label>
            <input id={inputId} type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
        </div>
    );
};

// Main Component
interface BackgroundPropToolProps {
  addToHistory: (image: GeneratedImage) => void;
  onImageClick: (image: GeneratedImage) => void;
  
  // State lifted up
  mainImage: BgPropImage | null;
  onMainImageChange: (image: BgPropImage | null) => void;
  backgrounds: (BgPropImage | null)[];
  onBackgroundsChange: (images: (BgPropImage | null)[]) => void;
  propsImages: (BgPropImage | null)[];
  onPropsImagesChange: (images: (BgPropImage | null)[]) => void;
  userPrompt: string;
  onUserPromptChange: (prompt: string) => void;
  generatedImage: GeneratedImage | null;
  onGeneratedImageChange: (image: GeneratedImage | null) => void;
}

export const BackgroundPropTool: React.FC<BackgroundPropToolProps> = ({
    addToHistory,
    onImageClick,
    mainImage, onMainImageChange,
    backgrounds, onBackgroundsChange,
    propsImages, onPropsImagesChange,
    userPrompt, onUserPromptChange,
    generatedImage, onGeneratedImageChange
}) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);

    const processAndSetImage = useCallback(async (file: File, target: 'main' | 'bg' | 'prop', index: number) => {
        if (file && file.type.startsWith('image/')) {
            try {
                const { base64, mimeType } = await fileToBase64(file);
                const url = `data:${mimeType};base64,${base64}`;
                const newImage = { data: base64, mime: mimeType, url };

                if (target === 'main') {
                    onMainImageChange(newImage);
                } else if (target === 'bg') {
                    const newBgs = [...backgrounds];
                    newBgs[index] = newImage;
                    onBackgroundsChange(newBgs);
                } else if (target === 'prop') {
                    const newProps = [...propsImages];
                    newProps[index] = newImage;
                    onPropsImagesChange(newProps);
                }
                
                onGeneratedImageChange(null);
                setError(null);
            } catch (err) {
                console.error("Error processing file", err);
                setError("이미지 파일을 불러올 수 없습니다.");
            }
        } else {
            setError("유효한 이미지 파일을 업로드해주세요.");
        }
    }, [onMainImageChange, backgrounds, onBackgroundsChange, propsImages, onPropsImagesChange, onGeneratedImageChange]);

    const handleClearImage = (target: 'main' | 'bg' | 'prop', index: number) => {
        if (target === 'main') {
            onMainImageChange(null);
        } else if (target === 'bg') {
            const newBgs = [...backgrounds];
            newBgs[index] = null;
            onBackgroundsChange(newBgs);
        } else if (target === 'prop') {
            const newProps = [...propsImages];
            newProps[index] = null;
            onPropsImagesChange(newProps);
        }
    };
    
    // Paste handler
    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        const file = items[i].getAsFile();
                        if (file) {
                            // Simple heuristic for pasting
                            if (!mainImage) processAndSetImage(file, 'main', 0);
                            else if (!backgrounds[0]) processAndSetImage(file, 'bg', 0);
                            else if (!propsImages[0]) processAndSetImage(file, 'prop', 0);
                        }
                        break; 
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [mainImage, backgrounds, propsImages, processAndSetImage]);

    const handleGeneratePrompt = useCallback(async () => {
        if (!mainImage) {
            setError("프롬프트 생성을 위해 메인 이미지를 먼저 업로드해주세요.");
            return;
        }

        setIsGeneratingPrompt(true);
        setError(null);
        try {
            const suggestedPrompt = await generatePromptForBgProp(
                mainImage,
                backgrounds,
                propsImages
            );
            onUserPromptChange(suggestedPrompt);
        } catch (err) {
            console.error("Prompt generation failed", err);
            setError("프롬프트 생성에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsGeneratingPrompt(false);
        }
    }, [mainImage, backgrounds, propsImages, onUserPromptChange]);

    const handleGenerate = useCallback(async () => {
        if (!mainImage) {
            setError("메인 인물 이미지를 업로드해주세요.");
            return;
        }

        setIsGenerating(true);
        setError(null);
        onGeneratedImageChange(null);

        try {
            const newImageSrc = await generateBackgroundAndPropsImage(
                mainImage,
                backgrounds,
                propsImages,
                userPrompt
            );

            const timestamp = Date.now();
            const date = new Date(timestamp);
            const folderName = `배경_소품_${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}-${date.getMinutes().toString().padStart(2, '0')}-${date.getSeconds().toString().padStart(2, '0')}`;
            
            const resultImage: GeneratedImage = { id: `${timestamp}-result`, src: newImageSrc, name: 'BG-Prop Result', folder: folderName, timestamp };
            addToHistory(resultImage);
            onGeneratedImageChange(resultImage);

        } catch (err) {
            console.error("Generation failed", err);
            setError("이미지 생성에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsGenerating(false);
        }

    }, [mainImage, backgrounds, propsImages, userPrompt, addToHistory, onGeneratedImageChange]);

    return (
        <div className="space-y-6">
            <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
                <h2 className="text-3xl font-bold mb-4 text-center">배경 및 소품 변경</h2>
                <p className="text-[var(--text-secondary)] text-center mb-6 max-w-2xl mx-auto">인물, 배경, 소품 이미지를 업로드하고 설명에 따라 AI가 이미지를 합성합니다.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-6">
                    <div className="md:col-span-2 lg:col-span-1">
                        <ImageUploader title="메인 인물" image={mainImage} onFileSelect={(f) => processAndSetImage(f, 'main', 0)} onClear={() => handleClearImage('main', 0)} className="h-96"/>
                    </div>
                    <div className="space-y-4">
                        <ImageUploader title="참조 배경 1" image={backgrounds[0]} onFileSelect={(f) => processAndSetImage(f, 'bg', 0)} onClear={() => handleClearImage('bg', 0)} />
                        <ImageUploader title="참조 배경 2" image={backgrounds[1]} onFileSelect={(f) => processAndSetImage(f, 'bg', 1)} onClear={() => handleClearImage('bg', 1)} />
                    </div>
                    <div className="space-y-2">
                        <ImageUploader title="참조 소품 1" image={propsImages[0]} onFileSelect={(f) => processAndSetImage(f, 'prop', 0)} onClear={() => handleClearImage('prop', 0)} className="h-28" />
                        <ImageUploader title="참조 소품 2" image={propsImages[1]} onFileSelect={(f) => processAndSetImage(f, 'prop', 1)} onClear={() => handleClearImage('prop', 1)} className="h-28" />
                        <ImageUploader title="참조 소품 3" image={propsImages[2]} onFileSelect={(f) => processAndSetImage(f, 'prop', 2)} onClear={() => handleClearImage('prop', 2)} className="h-28" />
                    </div>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label htmlFor="bg-prop-prompt" className="block text-lg font-medium text-[var(--text-primary)]">지시사항</label>
                        <button
                            onClick={handleGeneratePrompt}
                            disabled={!mainImage || isGenerating || isGeneratingPrompt}
                            className="bg-[var(--bg-info)] text-[var(--text-on-accent)] font-bold py-2 px-4 rounded-lg hover:bg-[var(--bg-info-hover)] transition-colors disabled:bg-[var(--bg-disabled)] disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                        >
                            {isGeneratingPrompt ? (
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                                <SparklesIcon className="w-5 h-5" />
                            )}
                            {isGeneratingPrompt ? '생성 중...' : '프롬프트 자동 생성'}
                        </button>
                    </div>
                    <textarea 
                        id="bg-prop-prompt"
                        rows={3}
                        value={userPrompt}
                        onChange={(e) => onUserPromptChange(e.target.value)}
                        placeholder="예: 메인 인물을 배경 1에 넣고, 소품 1을 손에 들게 해주세요. 전체적인 분위기는 배경 2처럼 맞춰주세요."
                        className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-3 text-sm focus:ring-[var(--ring-accent)] focus:border-[var(--border-accent)]"
                    />
                </div>
            </div>
            <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl text-center">
                 <button 
                    onClick={handleGenerate}
                    disabled={!mainImage || isGenerating}
                    className="bg-[var(--bg-positive)] text-[var(--text-on-accent)] font-bold py-3 px-8 rounded-lg hover:bg-[var(--bg-positive-hover)] transition-colors disabled:bg-[var(--bg-disabled)] disabled:cursor-not-allowed flex items-center min-w-[200px] justify-center mx-auto"
                    >
                    {isGenerating && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>}
                    {isGenerating ? '생성 중...' : '이미지 생성'}
                </button>
                {error && <p className="text-[var(--bg-negative)] mt-4">{error}</p>}
            </div>
            
            {(isGenerating || generatedImage) && (
                 <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
                    <h2 className="text-2xl font-bold mb-4">결과</h2>
                    <div className="flex justify-center">
                         <div className="w-full max-w-lg aspect-square bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-center relative group">
                            {isGenerating && <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--border-accent)]"></div>}
                            {generatedImage && (
                                <button onClick={() => onImageClick(generatedImage)} className="w-full h-full">
                                    <img src={generatedImage.src} alt="Generated result" className="w-full h-full object-contain rounded-lg" />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all">
                                        <p className="text-white text-lg font-bold opacity-0 group-hover:opacity-100 transition-opacity">클릭해서 보기</p>
                                    </div>
                                </button>
                            )}
                         </div>
                    </div>
                 </div>
            )}
        </div>
    );
};