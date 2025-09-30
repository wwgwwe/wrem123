import React, { useState, useCallback, useEffect } from 'react';
import { fileToBase64 } from '../utils/fileUtils';
import { generateCosplayImage } from '../services/geminiService';
import type { GeneratedImage, CosplayMainImage, CosplayRefImage } from '../types';
import { CloseIcon, ArrowLeftCircleIcon, ArrowRightCircleIcon } from './icons';
import { COSPLAY_PROMPT_TEMPLATES } from '../data/prompts/cosplayTemplates';

interface CosplayToolProps {
  addToHistory: (image: GeneratedImage) => void;
  onImageClick: (image: GeneratedImage) => void;
  mainImage: CosplayMainImage | null;
  onMainImageChange: (image: CosplayMainImage | null) => void;
  refImage: CosplayRefImage | null;
  onRefImageChange: (image: CosplayRefImage | null) => void;
  mainPrompt: string;
  onMainPromptChange: (prompt: string) => void;
  backgroundPrompt: string;
  onBackgroundPromptChange: (prompt: string) => void;
  generatedImage: GeneratedImage | null;
  onGeneratedImageChange: (image: GeneratedImage | null) => void;
}

// Helper to get image dimensions
const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
};

// Helper to crop image to a target aspect ratio from the center
const cropImage = async (imageUrl: string, mimeType: string, targetAspectRatio: number): Promise<{ data: string; mime: string; url: string }> => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imageUrl;
    });

    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    const sourceAspectRatio = sourceWidth / sourceHeight;

    let sx = 0, sy = 0, sWidth = sourceWidth, sHeight = sourceHeight;

    if (sourceAspectRatio > targetAspectRatio) {
        // Source is wider than target, crop sides
        sWidth = sourceHeight * targetAspectRatio;
        sx = (sourceWidth - sWidth) / 2;
    } else if (sourceAspectRatio < targetAspectRatio) {
        // Source is taller than target, crop top/bottom
        sHeight = sourceWidth / targetAspectRatio;
        sy = (sourceHeight - sHeight) / 2;
    }

    const canvas = document.createElement('canvas');
    canvas.width = sWidth;
    canvas.height = sHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }

    ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

    const croppedDataUrl = canvas.toDataURL(mimeType);
    const [header, data] = croppedDataUrl.split(',');

    return { data, mime: mimeType, url: croppedDataUrl };
};


const ImageUploader: React.FC<{
    title: string;
    image: { url: string } | null;
    onFileSelect: (file: File) => void;
    onClear: () => void;
}> = ({ title, image, onFileSelect, onClear }) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            onFileSelect(e.target.files[0]);
        }
        // Clear value to allow re-uploading the same file
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
                className={`w-full h-64 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-center border-2 border-dashed ${isDraggingOver ? 'border-[var(--border-accent)] bg-[var(--bg-interactive)]' : 'border-[var(--border-secondary)]'} transition-colors relative`}
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

export const CosplayTool: React.FC<CosplayToolProps> = ({ 
    addToHistory, 
    onImageClick,
    mainImage,
    onMainImageChange,
    refImage,
    onRefImageChange,
    mainPrompt,
    onMainPromptChange,
    backgroundPrompt,
    onBackgroundPromptChange,
    generatedImage,
    onGeneratedImageChange
}) => {
    const [croppedRefImage, setCroppedRefImage] = useState<{ data: string; mime: string; url: string } | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [currentTemplateIndex, setCurrentTemplateIndex] = useState(0);

    const processAndSetImage = useCallback(async (file: File, target: 'main' | 'ref') => {
        if (file && file.type.startsWith('image/')) {
            try {
                const { base64, mimeType } = await fileToBase64(file);
                const url = `data:${mimeType};base64,${base64}`;
                
                if (target === 'main') {
                    const { width, height } = await getImageDimensions(url);
                    const aspectRatio = (width > 0 && height > 0) ? width / height : 1;
                    onMainImageChange({ data: base64, mime: mimeType, url, aspectRatio });
                } else {
                    onRefImageChange({ data: base64, mime: mimeType, url });
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
    }, [onMainImageChange, onRefImageChange, onGeneratedImageChange]);
    
    useEffect(() => {
        const performCrop = async () => {
            if (!refImage) {
                setCroppedRefImage(null);
                return;
            }
            if (mainImage) {
                try {
                    const cropped = await cropImage(refImage.url, refImage.mime, mainImage.aspectRatio);
                    setCroppedRefImage(cropped);
                } catch (err) {
                    console.error("Failed to crop image:", err);
                    setError("참조 이미지를 처리하는 데 실패했습니다.");
                    setCroppedRefImage(refImage); // Fallback to uncropped on error
                }
            } else {
                // If there's no main image, just show the original reference image
                setCroppedRefImage(refImage);
            }
        };
        performCrop();
    }, [mainImage, refImage]);
    
    // Paste handler
    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        const file = items[i].getAsFile();
                        if (file) {
                            // Heuristic: if main is empty, paste there. Otherwise, paste to ref.
                            const target = !mainImage ? 'main' : 'ref';
                            processAndSetImage(file, target);
                        }
                        break; 
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [mainImage, processAndSetImage]);

    // Template Handlers
    useEffect(() => {
      if (COSPLAY_PROMPT_TEMPLATES.length > 0 && COSPLAY_PROMPT_TEMPLATES[currentTemplateIndex]) {
        // Fix: Access the 'content' property instead of the non-existent 'prompt' property.
        onBackgroundPromptChange(COSPLAY_PROMPT_TEMPLATES[currentTemplateIndex].content);
      } else if (COSPLAY_PROMPT_TEMPLATES.length === 0) {
        onBackgroundPromptChange('');
      }
    }, [currentTemplateIndex, onBackgroundPromptChange]);

    const handlePrevTemplate = () => {
        setCurrentTemplateIndex(prev => (prev - 1 + COSPLAY_PROMPT_TEMPLATES.length) % COSPLAY_PROMPT_TEMPLATES.length);
    };

    const handleNextTemplate = () => {
        setCurrentTemplateIndex(prev => (prev + 1) % COSPLAY_PROMPT_TEMPLATES.length);
    };

    const handleGenerate = useCallback(async () => {
        if (!mainImage || !croppedRefImage) {
            setError("메인 이미지와 참조 이미지를 모두 업로드해주세요.");
            return;
        }

        setIsGenerating(true);
        setError(null);
        onGeneratedImageChange(null);

        try {
            const newImageSrc = await generateCosplayImage(
                mainImage.data, mainImage.mime,
                croppedRefImage.data, croppedRefImage.mime,
                mainPrompt,
                backgroundPrompt
            );

            const timestamp = Date.now();
            const date = new Date(timestamp);
            const folderName = `코스프레_${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}-${date.getMinutes().toString().padStart(2, '0')}-${date.getSeconds().toString().padStart(2, '0')}`;

            const resultImage: GeneratedImage = { id: `${timestamp}-result`, src: newImageSrc, name: 'Cosplay Result', folder: folderName, timestamp };
            
            addToHistory(resultImage);

            onGeneratedImageChange(resultImage);

        } catch (err) {
            console.error("Generation failed", err);
            setError("코스프레 이미지 생성에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsGenerating(false);
        }

    }, [mainImage, croppedRefImage, mainPrompt, backgroundPrompt, addToHistory, onGeneratedImageChange]);

    return (
        <div className="space-y-6">
            <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
                <div className="flex justify-center items-center gap-4 mb-4">
                  <h2 className="text-3xl font-bold">코스프레 생성기</h2>
                  <a 
                    href="https://ai.studio/apps/drive/1BFWErMWSRUyUHYgjY_FyxdWI_qSBytJF"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[var(--bg-info)] text-[var(--text-on-accent)] text-sm font-semibold py-1 px-3 rounded-full hover:bg-[var(--bg-info-hover)] transition-colors whitespace-nowrap"
                  >
                    (디테일 앱실행)
                  </a>
                </div>
                <p className="text-[var(--text-secondary)] text-center mb-6 max-w-2xl mx-auto">인물 이미지와 캐릭터 참조 이미지를 업로드하세요. AI가 인물이 캐릭터를 코스프레하는 이미지를 생성합니다.</p>
                <div className="grid md:grid-cols-2 gap-8 mb-6">
                    <ImageUploader title="메인 인물" image={mainImage} onFileSelect={(f) => processAndSetImage(f, 'main')} onClear={() => onMainImageChange(null)} />
                    <ImageUploader title="참조 캐릭터" image={croppedRefImage} onFileSelect={(f) => processAndSetImage(f, 'ref')} onClear={() => onRefImageChange(null)} />
                </div>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="main-prompt" className="block text-lg font-medium text-[var(--text-primary)] mb-2">메인 프롬프트</label>
                        <textarea
                            id="main-prompt"
                            rows={5}
                            value={mainPrompt}
                            onChange={(e) => onMainPromptChange(e.target.value)}
                            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-3 text-sm focus:ring-[var(--ring-accent)] focus:border-[var(--border-accent)]"
                        />
                    </div>
                    <div>
                        <label htmlFor="bg-prompt" className="block text-lg font-medium text-[var(--text-primary)] mb-2">배경 프롬프트 (선택 사항)</label>
                        <input 
                            id="bg-prompt"
                            type="text"
                            value={backgroundPrompt}
                            onChange={(e) => onBackgroundPromptChange(e.target.value)}
                            placeholder="A simple, out-of-focus studio background."
                            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-3 text-sm focus:ring-[var(--ring-accent)] focus:border-[var(--border-accent)]"
                        />
                         <div className="mt-4 bg-[var(--bg-primary)]/50 p-3 rounded-lg">
                          <h4 className="text-md font-medium text-[var(--text-secondary)] mb-3">프롬프트 템플릿</h4>
                          <div className="flex items-center gap-4">
                            <div className="flex-grow flex items-center gap-2 bg-[var(--bg-tertiary)] p-2 rounded-lg">
                              <button onClick={handlePrevTemplate} disabled={COSPLAY_PROMPT_TEMPLATES.length <= 1} className="p-1 rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-interactive)] disabled:opacity-50 disabled:cursor-not-allowed">
                                <ArrowLeftCircleIcon className="w-6 h-6" />
                              </button>
                              <div className="flex-1 text-center">
                                {COSPLAY_PROMPT_TEMPLATES.length > 0 ? (
                                  // Fix: Access the 'name' property instead of the non-existent 'title' property.
                                  <p className="font-semibold truncate" title={COSPLAY_PROMPT_TEMPLATES[currentTemplateIndex]?.name}>
                                    {COSPLAY_PROMPT_TEMPLATES[currentTemplateIndex]?.name}
                                  </p>
                                ) : (
                                  <p className="text-[var(--text-secondary)]">템플릿 없음</p>
                                )}
                              </div>
                              <button onClick={handleNextTemplate} disabled={COSPLAY_PROMPT_TEMPLATES.length <= 1} className="p-1 rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-interactive)] disabled:opacity-50 disabled:cursor-not-allowed">
                                <ArrowRightCircleIcon className="w-6 h-6" />
                              </button>
                            </div>
                          </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl text-center">
                 <button 
                    onClick={handleGenerate}
                    disabled={!mainImage || !croppedRefImage || isGenerating}
                    className="bg-[var(--bg-positive)] text-[var(--text-on-accent)] font-bold py-3 px-8 rounded-lg hover:bg-[var(--bg-positive-hover)] transition-colors disabled:bg-[var(--bg-disabled)] disabled:cursor-not-allowed flex items-center min-w-[200px] justify-center mx-auto"
                    >
                    {isGenerating && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>}
                    {isGenerating ? '생성 중...' : '코스프레 생성'}
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
                                    <img src={generatedImage.src} alt="Cosplay result" className="w-full h-full object-contain rounded-lg" />
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
