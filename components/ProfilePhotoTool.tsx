import React, { useState, useCallback, useEffect } from 'react';
import { fileToBase64 } from '../utils/fileUtils';
import { generateProfilePhoto, modifyPromptForJob, modifyPromptForConcept } from '../services/geminiService';
import type { GeneratedImage, StudioPromptCategory, StudioPromptGender } from '../types';
import { STUDIO_PROMPTS } from '../data/prompts/studioPrompts';
import { CloseIcon, ChevronDownIcon } from './icons';

type UploadedImage = { data: string; mime: string; url: string };

type GenerationStatus = 'pending' | 'loading' | 'success' | 'failed';
interface GenerationSlot {
    image: GeneratedImage | null;
    status: GenerationStatus;
    prompt: string;
}

const THEME_OPTIONS: { id: StudioPromptCategory | 'mixed', name: string }[] = [
    { id: 'mixed', name: '혼합 스타일' },
    { id: 'professional', name: '전문적인 스타일' },
    { id: 'casual', name: '캐주얼 스타일' },
    { id: 'high-fashion', name: '하이패션 스타일' },
];

const SCOPE_OPTIONS: { id: 'face' | 'upper-body' | 'full-body' | 'random', name: string }[] = [
    { id: 'face', name: '얼굴 위주' },
    { id: 'upper-body', name: '상반신 (추천)' },
    { id: 'full-body', name: '전신' },
    { id: 'random', name: '전체 랜덤' },
];

const GallerySlot: React.FC<{
  slot: GenerationSlot | null;
  onImageClick: () => void;
  onRegenerateClick: () => void;
}> = ({ slot, onImageClick, onRegenerateClick }) => {
    if (!slot || slot.status === 'pending') {
        return <div className="aspect-square bg-[var(--bg-tertiary)] rounded-lg shadow-md" />;
    }

    if (slot.status === 'loading') {
        return (
            <div className="relative aspect-square bg-[var(--bg-tertiary)] rounded-lg overflow-hidden shadow-md flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--border-accent)]"></div>
            </div>
        );
    }
    
    if (slot.status === 'failed') {
        return (
            <div className="relative aspect-square bg-[var(--bg-tertiary)] rounded-lg overflow-hidden shadow-md flex flex-col items-center justify-center p-2 text-center">
                <p className="text-sm text-red-500 mb-2">생성 실패</p>
                <button
                    onClick={onRegenerateClick}
                    className="bg-[var(--bg-accent)] text-[var(--text-on-accent)] font-bold py-1.5 px-3 rounded-md hover:bg-[var(--bg-accent-hover)] transition-colors text-xs"
                >
                    재생성
                </button>
            </div>
        );
    }
    
    if (slot.status === 'success' && slot.image) {
        return (
            <button
                onClick={onImageClick}
                className="relative aspect-square bg-[var(--bg-tertiary)] rounded-lg overflow-hidden shadow-md group"
            >
                <img src={slot.image.src} alt={slot.image.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
            </button>
        );
    }

    return <div className="aspect-square bg-[var(--bg-tertiary)] rounded-lg shadow-md" />;
};


export const ProfilePhotoTool: React.FC<{
  addToHistory: (image: GeneratedImage) => void;
  onImageClick: (image: GeneratedImage) => void;
}> = ({ addToHistory, onImageClick }) => {
    const [sourceImages, setSourceImages] = useState<UploadedImage[]>([]);
    const [gender, setGender] = useState<StudioPromptGender>('female');
    const [shootingScope, setShootingScope] = useState<'face' | 'upper-body' | 'full-body' | 'random'>('upper-body');
    const [styleTheme, setStyleTheme] = useState<StudioPromptCategory | 'mixed'>('professional');
    const [jobTitle, setJobTitle] = useState('');
    const [concept, setConcept] = useState('');
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    
    const [generationSlots, setGenerationSlots] = useState<GenerationSlot[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [generationCount, setGenerationCount] = useState(20);
    const MAX_IMAGES = 5;

    const processFiles = useCallback(async (files: File[]) => {
        const imageFiles = files.filter(f => f.type.startsWith('image/')).slice(0, MAX_IMAGES - sourceImages.length);
        if (imageFiles.length === 0) return;
        try {
            const newImages = await Promise.all(
                imageFiles.map(async file => {
                    const { base64, mimeType } = await fileToBase64(file);
                    return { data: base64, mime: mimeType, url: `data:${mimeType};base64,${base64}` };
                })
            );
            setSourceImages(prev => [...prev, ...newImages]);
            setGenerationSlots([]);
            setError(null);
        } catch (err) {
            setError("이미지 파일을 불러올 수 없습니다.");
        }
    }, [sourceImages.length]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) await processFiles(Array.from(e.target.files));
        e.target.value = '';
    };
    
    const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); setIsDraggingOver(true); };
    const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); setIsDraggingOver(false); };
    const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        setIsDraggingOver(false);
        processFiles(Array.from(e.dataTransfer.files));
    };
    
    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const files = Array.from(event.clipboardData?.files || []);
            processFiles(files);
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [processFiles]);

    const removeSourceImage = (index: number) => {
        setSourceImages(prev => prev.filter((_, i) => i !== index));
    };

    const getPromptVariations = useCallback((count: number): string[] => {
        let availablePrompts = STUDIO_PROMPTS.filter(p => p.gender === gender || p.gender === 'unisex');
    
        if (styleTheme !== 'mixed') {
            availablePrompts = availablePrompts.filter(p => p.category === styleTheme);
        }
        
        if (shootingScope !== 'random') {
            availablePrompts = availablePrompts.filter(p => {
                const text = p.text.toLowerCase();
                const isFullBody = text.includes('full-body') || text.includes('standing') || text.includes('sitting') || text.includes('kneeling') || text.includes('perched');
                const isPortrait = text.includes('portrait') || text.includes('close-up') || text.includes('headshot') || !isFullBody;
                if (shootingScope === 'full-body') return isFullBody;
                if (shootingScope === 'face' || shootingScope === 'upper-body') return isPortrait;
                return false;
            });
        }
        
        if (availablePrompts.length === 0) {
            availablePrompts = STUDIO_PROMPTS.filter(p => p.gender === gender || p.gender === 'unisex');
        }

        const shuffled = [...availablePrompts].sort(() => 0.5 - Math.random());
        
        const finalPrompts: string[] = [];
        if (shuffled.length > 0) {
            for (let i = 0; i < count; i++) {
                finalPrompts.push(shuffled[i % shuffled.length].text);
            }
        }
        
        const base = `Using the people from the source images, recreate one of them while preserving their exact facial features and identity. The new image must look like a real, high-quality photograph.`;
        return finalPrompts.map(promptText => `${base} ${promptText}`);
    }, [gender, styleTheme, shootingScope]);

    const handleGenerate = useCallback(async () => {
        if (sourceImages.length === 0) {
            setError("먼저 한 장 이상의 이미지를 업로드해주세요.");
            return;
        }
        
        setIsGenerating(true);
        setError(null);

        const prompts = getPromptVariations(generationCount);
        const initialSlots: GenerationSlot[] = prompts.map(p => ({
            image: null,
            status: 'loading',
            prompt: p,
        }));
        setGenerationSlots(initialSlots);

        const timestamp = Date.now();
        const date = new Date(timestamp);
        const folderName = `AI프로필_${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}_${date.getHours()}-${date.getMinutes()}`;
        sourceImages.forEach((img, i) => addToHistory({ id: `${timestamp}-original-${i}`, src: img.url, name: `Original ${i+1}`, folder: folderName, timestamp }));

        const processSlot = async (prompt: string, index: number) => {
            try {
                let finalPrompt = prompt;
                if (jobTitle.trim()) {
                    finalPrompt = await modifyPromptForJob(prompt, jobTitle.trim());
                }
                if (concept.trim()) {
                    finalPrompt = await modifyPromptForConcept(finalPrompt, concept.trim());
                }

                const newImageSrc = await generateProfilePhoto(sourceImages.map(img => ({ data: img.data, mime: img.mime })), finalPrompt);
                
                const newImage: GeneratedImage = {
                    id: `${timestamp}-gen-${index}`, src: newImageSrc, name: `Profile Photo ${index + 1}`, folder: folderName, timestamp,
                };
                addToHistory(newImage);
                setGenerationSlots(prev => {
                    const newSlots = [...prev];
                    newSlots[index] = { ...newSlots[index], image: newImage, status: 'success' };
                    return newSlots;
                });
            } catch (err) {
                console.error(`Failed to generate image ${index + 1}:`, err);
                setGenerationSlots(prev => {
                    const newSlots = [...prev];
                    newSlots[index] = { ...newSlots[index], status: 'failed' };
                    return newSlots;
                });
            }
        };

        const generationPromises = prompts.map(processSlot);
        await Promise.all(generationPromises);

        setIsGenerating(false);
    }, [sourceImages, getPromptVariations, generationCount, addToHistory, jobTitle, concept]);
    
    const handleRegenerateSingle = useCallback(async (index: number) => {
        const slot = generationSlots[index];
        if (!slot || slot.status !== 'failed') return;
    
        setGenerationSlots(prev => {
            const newSlots = [...prev];
            newSlots[index] = { ...newSlots[index], status: 'loading' };
            return newSlots;
        });
    
        const timestamp = Date.now();
        const existingFolder = generationSlots.find(s => s.image?.folder)?.image?.folder;
        const date = new Date(timestamp);
        const folderName = existingFolder || `AI프로필_재생성_${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const prompt = slot.prompt;
    
        try {
            let finalPrompt = prompt;
            if (jobTitle.trim()) {
                finalPrompt = await modifyPromptForJob(prompt, jobTitle.trim());
            }
            if (concept.trim()) {
                finalPrompt = await modifyPromptForConcept(finalPrompt, concept.trim());
            }
    
            const newImageSrc = await generateProfilePhoto(sourceImages.map(img => ({ data: img.data, mime: img.mime })), finalPrompt);
            
            const newImage: GeneratedImage = {
                id: `${timestamp}-regen-${index}`,
                src: newImageSrc,
                name: `Profile Photo ${index + 1} (Regen)`,
                folder: folderName,
                timestamp,
            };
    
            addToHistory(newImage);
            
            setGenerationSlots(prev => {
                const newSlots = [...prev];
                newSlots[index] = { ...newSlots[index], image: newImage, status: 'success' };
                return newSlots;
            });
    
        } catch (err) {
            console.error(`Failed to regenerate image ${index + 1}:`, err);
            setGenerationSlots(prev => {
                const newSlots = [...prev];
                newSlots[index] = { ...newSlots[index], status: 'failed' };
                return newSlots;
            });
        }
    }, [generationSlots, sourceImages, jobTitle, concept, addToHistory]);

    const renderStep = (num: number, title: string, content: React.ReactNode, subtext?: string) => (
        <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
            <div className="flex items-center mb-1">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[var(--bg-accent)] text-[var(--text-on-accent)] font-bold mr-3 text-sm flex-shrink-0">{num}</span>
                <h3 className="text-lg font-semibold">{title}</h3>
            </div>
            {subtext && <p className="text-[var(--text-secondary)] text-sm mb-4 ml-11">{subtext}</p>}
            <div className="ml-11">{content}</div>
        </div>
    );

    return (
        <div className="flex h-full gap-8">
            <aside className="w-[420px] flex-shrink-0 flex flex-col gap-6 overflow-y-auto pr-2">
                <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl flex-shrink-0">
                    <h2 className="text-xl font-bold mb-1">AI 스튜디오</h2>
                    <p className="text-[var(--text-secondary)] text-sm">AI 프로필 사진 생성기</p>
                </div>
                
                {renderStep(1, "사진 업로드", (
                    <div className="space-y-3">
                         <div className="grid grid-cols-3 gap-2">
                            {sourceImages.map((img, i) => (
                                <div key={i} className="relative aspect-square">
                                    <img src={img.url} alt={`source ${i+1}`} className="w-full h-full object-cover rounded-md"/>
                                    <button onClick={() => removeSourceImage(i)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><CloseIcon className="w-3 h-3"/></button>
                                </div>
                            ))}
                            {sourceImages.length < MAX_IMAGES && (
                                <label htmlFor="profile-photo-upload" className={`aspect-square w-full flex items-center justify-center border-2 border-dashed rounded-md cursor-pointer transition-colors ${isDraggingOver ? 'border-[var(--border-accent)] bg-[var(--bg-interactive)]' : 'border-[var(--border-secondary)]'}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                                    <span className="text-3xl text-[var(--text-secondary)]">+</span>
                                </label>
                            )}
                         </div>
                        <input id="profile-photo-upload" type="file" className="hidden" accept="image/*" multiple onChange={handleFileChange} />
                        <p className="text-xs text-[var(--text-secondary)]">팁: 더 나은 결과를 위해 여러 장의 사진을 추가하세요: 정면(무표정), 정면(웃는 표정), 측면 뷰.</p>
                    </div>
                ))}

                {renderStep(2, "생성 옵션", (
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-medium text-[var(--text-primary)] mb-2">성별</h4>
                            <div className="grid grid-cols-2 gap-2 bg-[var(--bg-primary)] p-1 rounded-lg">
                                <button onClick={() => setGender('female')} className={`py-2 text-sm rounded-md ${gender === 'female' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>여성</button>
                                <button onClick={() => setGender('male')} className={`py-2 text-sm rounded-md ${gender === 'male' ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' : 'hover:bg-[var(--bg-tertiary)]'}`}>남성</button>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-md font-medium text-[var(--text-primary)] mb-2">촬영 범위</h4>
                            <div className="grid grid-cols-2 gap-2">
                               {SCOPE_OPTIONS.map(opt => <button key={opt.id} onClick={() => setShootingScope(opt.id)} className={`py-2 text-sm rounded-md ${shootingScope === opt.id ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-interactive)]'}`}>{opt.name}</button>)}
                            </div>
                        </div>
                        <div>
                            <h4 className="text-md font-medium text-[var(--text-primary)] mb-2">스타일 선택</h4>
                            <div className="grid grid-cols-2 gap-2">
                               {THEME_OPTIONS.map(opt => <button key={opt.id} onClick={() => setStyleTheme(opt.id)} className={`py-2 text-sm rounded-md ${styleTheme === opt.id ? 'bg-[var(--bg-accent)] text-[var(--text-on-accent)]' : 'bg-[var(--bg-tertiary)] hover:bg-[var(--bg-interactive)]'}`}>{opt.name}</button>)}
                            </div>
                        </div>
                         <details className="space-y-2" onToggle={(e) => setIsAdvancedOpen(e.currentTarget.open)}>
                            <summary className="cursor-pointer text-md font-medium text-[var(--text-primary)] flex items-center justify-between">
                                고급 설정 (선택 사항)
                                <ChevronDownIcon className={`w-5 h-5 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
                            </summary>
                            <div className="pt-2 space-y-3">
                                <div>
                                    <label htmlFor="job-title" className="block text-sm font-medium mb-1">직업</label>
                                    <input type="text" id="job-title" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="예: 변호사, 의사, 개발자" className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-2 text-sm"/>
                                    <p className="text-xs text-[var(--text-secondary)] mt-1">직업을 입력하면 해당 직업에 맞는 의상으로 변경하여 이미지를 생성합니다.</p>
                                </div>
                                <div>
                                    <label htmlFor="concept" className="block text-sm font-medium mb-1">컨셉 또는 오브젝트</label>
                                    <input type="text" id="concept" value={concept} onChange={e => setConcept(e.target.value)} placeholder="예: 책을 들고, 사이버펑크" className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-2 text-sm"/>
                                    <p className="text-xs text-[var(--text-secondary)] mt-1">입력한 컨셉이나 오브젝트를 프롬프트에 자연스럽게 반영하여 이미지를 생성합니다.</p>
                                </div>
                            </div>
                        </details>
                    </div>
                ))}
                
                {renderStep(3, "프로필 사진 생성", (
                    <>
                        <div className="mb-4">
                            <label htmlFor="generation-count-slider" className="block text-md font-medium text-[var(--text-primary)] mb-2">
                                생성 개수: <span className="font-bold text-[var(--border-accent)]">{generationCount}</span>
                            </label>
                            <input 
                                id="generation-count-slider"
                                type="range" 
                                min="1" 
                                max="30" 
                                value={generationCount} 
                                onChange={(e) => setGenerationCount(Number(e.target.value))}
                                className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:bg-[var(--bg-accent)] [&::-moz-range-thumb]:bg-[var(--bg-accent)]"
                            />
                        </div>
                        <p className="text-[var(--text-secondary)] text-sm mb-4">아래 버튼을 클릭하여 선택한 옵션으로 {generationCount}개의 독특한 스튜디오 프로필 사진을 생성하세요.</p>
                        <button onClick={() => handleGenerate()} disabled={sourceImages.length === 0 || isGenerating} className="w-full bg-[var(--bg-positive)] text-[var(--text-on-accent)] font-bold py-3 px-6 rounded-lg hover:bg-[var(--bg-positive-hover)] transition-colors disabled:bg-[var(--bg-disabled)] disabled:cursor-not-allowed flex items-center justify-center">
                            {isGenerating && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>}
                            {isGenerating ? `${generationCount}개 생성 중...` : `생성 시작`}
                        </button>
                        {error && <p className="text-[var(--bg-negative)] mt-2 text-sm text-center">{error}</p>}
                    </>
                ), `총 ${generationCount}장 생성`)}
            </aside>
            
            <main className="flex-1 bg-[var(--bg-primary)] p-6 rounded-lg shadow-xl flex flex-col">
                 <h2 className="text-xl font-bold mb-4 text-[var(--text-accent)]">갤러리</h2>
                 <div className="flex-grow overflow-y-auto pr-2">
                    {generationSlots.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {generationSlots.map((slot, index) => (
                                <GallerySlot
                                    key={index}
                                    slot={slot}
                                    onImageClick={() => slot.image && onImageClick(slot.image)}
                                    onRegenerateClick={() => handleRegenerateSingle(index)}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-center text-[var(--text-secondary)]">
                            <p>생성된 프로필 사진이 여기에 표시됩니다.</p>
                        </div>
                    )}
                 </div>
            </main>
        </div>
    );
};