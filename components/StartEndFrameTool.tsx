import React, { useState, useCallback, useEffect } from 'react';
import { fileToBase64 } from '../utils/fileUtils';
import { generateStartEndFrame, generateVideoPromptsForFrames } from '../services/geminiService';
import type { GeneratedImage, BgPropImage, VideoPrompts } from '../types';
import { PhotoIcon, SparklesIcon, CopyIcon, CheckIcon } from './icons';

interface StartEndFrameToolProps {
  addToHistory: (image: GeneratedImage) => void;
  onImageClick: (image: GeneratedImage) => void;
}

const ImagePlaceholder: React.FC<{ title: string, src?: string | null, isLoading?: boolean }> = ({ title, src, isLoading }) => (
    <div className="aspect-video bg-[var(--bg-tertiary)] rounded-lg flex flex-col items-center justify-center relative shadow-inner w-full">
        {isLoading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-lg">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--border-accent)]"></div>
            </div>
        )}
        {src ? (
            <img src={src} alt={title} className="w-full h-full object-contain rounded-lg" />
        ) : (
            <>
                <PhotoIcon className="w-16 h-16 text-[var(--text-secondary)]/50 mb-2" />
                <p className="text-[var(--text-secondary)] font-medium">{title}</p>
            </>
        )}
    </div>
);

const PromptResultDisplay: React.FC<{ prompts: VideoPrompts }> = ({ prompts }) => {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const handleCopy = (key: keyof VideoPrompts, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    return (
        <div className="space-y-4">
            {Object.entries(prompts).map(([key, value]) => (
                <div key={key}>
                    <div className="flex justify-between items-center mb-1">
                        <h4 className="font-semibold text-[var(--text-primary)] capitalize">{key.replace(/_/g, '.')}</h4>
                        <button 
                            // Fix: Cast 'value' to string to resolve TypeScript error where it is inferred as 'unknown'.
                            onClick={() => handleCopy(key as keyof VideoPrompts, value as string)}
                            className="bg-[var(--bg-interactive)] hover:bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                        >
                            {copiedKey === key ? <CheckIcon className="w-4 h-4 text-green-500" /> : <CopyIcon className="w-4 h-4" />}
                            {copiedKey === key ? '복사됨!' : '복사'}
                        </button>
                    </div>
                    <p className="bg-[var(--bg-primary)] p-3 rounded-lg text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-sans border border-[var(--border-primary)]">{value}</p>
                </div>
            ))}
        </div>
    );
};

export const StartEndFrameTool: React.FC<StartEndFrameToolProps> = ({ addToHistory }) => {
    const [direction, setDirection] = useState<'start-to-end' | 'end-to-start'>('start-to-end');
    const [sourceImage, setSourceImage] = useState<BgPropImage | null>(null);
    const [storyPrompt, setStoryPrompt] = useState('');
    const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
    const [videoPrompts, setVideoPrompts] = useState<VideoPrompts | null>(null);
    const [isLoadingFrame, setIsLoadingFrame] = useState(false);
    const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const resetForNewImage = () => {
        setGeneratedImage(null);
        setVideoPrompts(null);
        setError(null);
    };

    const processFile = useCallback(async (file: File) => {
        if (file && file.type.startsWith('image/')) {
            try {
                const { base64, mimeType } = await fileToBase64(file);
                setSourceImage({ data: base64, mime: mimeType, url: `data:${mimeType};base64,${base64}` });
                resetForNewImage();
            } catch (err) {
                setError("이미지 파일을 불러올 수 없습니다.");
            }
        } else {
            setError("유효한 이미지 파일(PNG, JPG 등)을 업로드해주세요.");
        }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) processFile(e.target.files[0]);
    };

    const handleGenerateFrame = async () => {
        if (!sourceImage || !storyPrompt.trim()) {
            setError("이미지와 스토리 프롬프트를 모두 입력해주세요.");
            return;
        }
        setIsLoadingFrame(true);
        setError(null);
        setGeneratedImage(null);
        setVideoPrompts(null);

        try {
            const newImageSrc = await generateStartEndFrame(sourceImage.data, sourceImage.mime, storyPrompt, direction);
            const timestamp = Date.now();
            const folderName = `StartEndFrame_${timestamp}`;
            
            const sourceImgHistory: GeneratedImage = {
                id: `${timestamp}-source`,
                src: sourceImage.url,
                name: direction === 'start-to-end' ? 'Start Frame' : 'End Frame',
                folder: folderName,
                timestamp,
            };
            const newImgHistory: GeneratedImage = {
                id: `${timestamp}-generated`,
                src: newImageSrc,
                name: direction === 'start-to-end' ? 'End Frame' : 'Start Frame',
                folder: folderName,
                timestamp,
            };
            
            addToHistory(sourceImgHistory);
            addToHistory(newImgHistory);
            setGeneratedImage(newImgHistory);
        } catch (err) {
            setError("프레임 생성에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsLoadingFrame(false);
        }
    };

    const handleGeneratePrompts = async () => {
        const startImg = direction === 'start-to-end' ? sourceImage : (generatedImage ? { data: generatedImage.src.split(',')[1], mime: generatedImage.src.match(/:(.*?);/)?.[1] || '' } : null);
        const endImg = direction === 'start-to-end' ? (generatedImage ? { data: generatedImage.src.split(',')[1], mime: generatedImage.src.match(/:(.*?);/)?.[1] || '' } : null) : sourceImage;

        if (!startImg || !endImg || !storyPrompt.trim()) {
            setError("프롬프트 생성을 위해 시작 및 종료 프레임과 스토리가 모두 필요합니다.");
            return;
        }

        setIsLoadingPrompts(true);
        setError(null);
        setVideoPrompts(null);

        try {
            const prompts = await generateVideoPromptsForFrames(startImg, endImg, storyPrompt);
            setVideoPrompts(prompts);
        } catch (err) {
            setError("영상 프롬프트 생성에 실패했습니다.");
        } finally {
            setIsLoadingPrompts(false);
        }
    };

    const startFrameSrc = direction === 'start-to-end' ? sourceImage?.url : generatedImage?.src;
    const endFrameSrc = direction === 'end-to-start' ? sourceImage?.url : generatedImage?.src;

    return (
        <div className="flex h-full gap-8">
            <aside className="w-96 flex-shrink-0 flex flex-col gap-4">
                <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl flex-shrink-0">
                    <h2 className="text-xl font-bold">Start/End 생성</h2>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">AI 영상 생성을 위한 시작과 끝 프레임을 만듭니다.</p>
                </div>
                
                <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl flex-shrink-0 space-y-5">
                    <h3 className="text-lg font-bold">1. 프레임 설정</h3>
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">생성 방향</label>
                        <div className="grid grid-cols-2 gap-2 bg-[var(--bg-primary)] p-1 rounded-lg">
                            <button onClick={() => setDirection('start-to-end')} className={`py-2 text-sm font-bold rounded-md transition-colors ${direction === 'start-to-end' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)] shadow-lg' : 'hover:bg-[var(--bg-tertiary)]'}`}>시작 → 끝</button>
                            <button onClick={() => setDirection('end-to-start')} className={`py-2 text-sm font-bold rounded-md transition-colors ${direction === 'end-to-start' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)] shadow-lg' : 'hover:bg-[var(--bg-tertiary)]'}`}>끝 → 시작</button>
                        </div>
                    </div>
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                        onDragLeave={() => setIsDraggingOver(false)}
                        onDrop={(e) => { e.preventDefault(); setIsDraggingOver(false); if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }}
                        className={`p-4 rounded-lg border-2 border-dashed ${isDraggingOver ? 'border-[var(--border-accent)]' : 'border-[var(--border-primary)]'}`}
                    >
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">{direction === 'start-to-end' ? '시작 프레임' : '마지막 프레임'}</label>
                        <div className="h-40 bg-[var(--bg-tertiary)] rounded flex items-center justify-center text-center text-[var(--text-secondary)] text-sm relative">
                            {sourceImage ? (
                                <img src={sourceImage.url} alt="Source" className="w-full h-full object-contain p-1" />
                            ) : (
                                <p>이미지 업로드<br/>또는 드래그 앤 드롭</p>
                            )}
                            <input type="file" className="hidden" id="frame-upload" accept="image/*" onChange={handleFileChange} />
                            <label htmlFor="frame-upload" className="absolute inset-0 cursor-pointer" />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="story-prompt" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">스토리 프롬프트</label>
                        <textarea id="story-prompt" rows={4} value={storyPrompt} onChange={e => setStoryPrompt(e.target.value)} placeholder={direction === 'start-to-end' ? '마지막 장면에 대한 설명을 입력하세요.' : '시작 장면에 대한 설명을 입력하세요.'} className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-2 text-sm focus:ring-[var(--ring-accent)] focus:border-[var(--border-accent)]" />
                    </div>
                    <button onClick={handleGenerateFrame} disabled={isLoadingFrame || isLoadingPrompts} className="w-full bg-[var(--bg-positive)] text-[var(--text-on-accent)] font-bold py-2.5 px-4 rounded-lg hover:bg-[var(--bg-positive-hover)] transition-colors disabled:bg-[var(--bg-disabled)] flex items-center justify-center gap-2">
                        {isLoadingFrame ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <SparklesIcon className="w-5 h-5" />}
                        {isLoadingFrame ? '생성 중...' : '장면 생성'}
                    </button>
                </div>

                <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl flex-grow overflow-y-auto">
                    <h3 className="text-lg font-bold mb-4">2. 전환 프롬프트 추천</h3>
                    <button onClick={handleGeneratePrompts} disabled={!generatedImage || isLoadingPrompts || isLoadingFrame} className="w-full bg-[var(--bg-info)] text-[var(--text-on-accent)] font-bold py-2.5 px-4 rounded-lg hover:bg-[var(--bg-info-hover)] transition-colors disabled:bg-[var(--bg-disabled)] flex items-center justify-center gap-2 mb-4">
                        {isLoadingPrompts ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : <SparklesIcon className="w-5 h-5" />}
                        {isLoadingPrompts ? '추천받는 중...' : '추천 받기'}
                    </button>
                    {videoPrompts ? <PromptResultDisplay prompts={videoPrompts} /> : <p className="text-sm text-[var(--text-secondary)] text-center">장면 생성 후 추천 받을 수 있습니다.</p>}
                </div>
                 {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative flex-shrink-0" role="alert"><span className="block sm:inline">{error}</span></div>}
            </aside>
            <main className="flex-1 flex flex-col gap-8">
                <div className="flex-shrink-0">
                    <h2 className="text-2xl font-bold mb-4">장면 미리보기</h2>
                    <div className="flex items-center justify-center gap-4">
                        <ImagePlaceholder title="시작 프레임" src={startFrameSrc} isLoading={direction === 'end-to-start' && isLoadingFrame} />
                        <svg className="w-12 h-12 text-[var(--text-secondary)] flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                        <ImagePlaceholder title="마지막 프레임" src={endFrameSrc} isLoading={direction === 'start-to-end' && isLoadingFrame} />
                    </div>
                </div>
            </main>
        </div>
    );
};