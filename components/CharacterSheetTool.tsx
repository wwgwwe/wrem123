import React, { useState, useCallback, useEffect } from 'react';
import { fileToBase64 } from '../utils/fileUtils';
import { editImageWithNanoBanana } from '../services/geminiService';
import { CHARACTER_SHEET_VIEWS } from '../constants';
import type { GeneratedImage } from '../types';

interface CharacterSheetToolProps {
  addToHistory: (image: GeneratedImage) => void;
  sourceImage: string | null;
  onImageClick: (image: GeneratedImage) => void;
}

interface LoadingStates {
  [key: string]: boolean;
}

const ImageCard: React.FC<{ name: string; image?: GeneratedImage; isLoading: boolean; onClick: () => void; }> = ({ name, image, isLoading, onClick }) => (
  <button 
    onClick={onClick}
    disabled={isLoading}
    className="relative text-left aspect-square bg-[var(--bg-tertiary)] rounded-lg overflow-hidden shadow-md flex items-center justify-center group disabled:cursor-not-allowed disabled:opacity-50 transition-all hover:ring-2 hover:ring-[var(--ring-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--ring-accent)]"
  >
    {isLoading && (
      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
      </div>
    )}
    {image ? (
      <img src={image.src} alt={name} className="w-full h-full object-cover" />
    ) : (
      !isLoading && <span className="text-[var(--text-secondary)] text-sm p-2 text-center">{name}</span>
    )}
    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 p-2">
      <p className="text-white text-center text-xs font-semibold truncate">{name}</p>
    </div>
  </button>
);

export const CharacterSheetTool: React.FC<CharacterSheetToolProps> = ({ addToHistory, sourceImage: initialSource, onImageClick }) => {
  const [sourceImage, setSourceImage] = useState<{ data: string; mime: string; url: string } | null>(null);
  const [generatedImages, setGeneratedImages] = useState<Record<string, GeneratedImage>>({});
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({});
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);

  useEffect(() => {
    if (initialSource) {
      const mime = initialSource.substring(initialSource.indexOf(':') + 1, initialSource.indexOf(';'));
      const data = initialSource.substring(initialSource.indexOf(',') + 1);
      setSourceImage({ data, mime, url: initialSource });
      setGeneratedImages({});
      setFolderName(null);
    }
  }, [initialSource]);

  const processFile = async (file: File) => {
    if (file && file.type.startsWith('image/')) {
        try {
            const { base64, mimeType } = await fileToBase64(file);
            setSourceImage({ data: base64, mime: mimeType, url: `data:${mimeType};base64,${base64}` });
            setGeneratedImages({});
            setError(null);
            setFolderName(null);
        } catch (err) {
            console.error("Error converting file to base64", err);
            setError("이미지 파일을 불러올 수 없습니다.");
        }
    } else {
        setError("유효한 이미지 파일(PNG, JPG 등)을 업로드해주세요.");
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await processFile(file);
    }
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
        processFile(file);
    }
  };

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
        const items = event.clipboardData?.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if(file) {
                        processFile(file);
                    }
                    break; 
                }
            }
        }
    };
    window.addEventListener('paste', handlePaste);
    return () => {
        window.removeEventListener('paste', handlePaste);
    };
  }, []);

  const handleGenerateSingleView = useCallback(async (view: { id: string, name: string, prompt: string }) => {
    if (!sourceImage) {
        setError("먼저 원본 이미지를 업로드해주세요.");
        return;
    }

    setLoadingStates(prev => ({ ...prev, [view.id]: true }));
    setError(null);

    const timestamp = Date.now();
    let currentFolderName = folderName;

    if (!currentFolderName) {
        const date = new Date(timestamp);
        currentFolderName = `캐릭터_시트_${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}-${date.getMinutes().toString().padStart(2, '0')}-${date.getSeconds().toString().padStart(2, '0')}`;
        setFolderName(currentFolderName);
        
        const originalImageForHistory: GeneratedImage = {
            id: `${timestamp}-original`,
            src: sourceImage.url,
            name: 'Original',
            folder: currentFolderName,
            timestamp,
        };
        addToHistory(originalImageForHistory);
    }

    try {
        const newImageSrc = await editImageWithNanoBanana(sourceImage.data, sourceImage.mime, view.prompt);
        const newImage: GeneratedImage = {
            id: `${timestamp}-${view.id}`,
            src: newImageSrc,
            name: view.name,
            folder: currentFolderName,
            timestamp,
        };
        addToHistory(newImage);
        setGeneratedImages(prev => ({ ...prev, [view.id]: newImage }));
    } catch (err) {
        console.error(`Failed to generate ${view.name}:`, err);
        setError(`${view.name} 생성에 실패했습니다. 다시 시도해주세요.`);
    } finally {
        setLoadingStates(prev => ({ ...prev, [view.id]: false }));
    }
  }, [sourceImage, folderName, addToHistory]);

  const handleGenerateSheet = useCallback(async () => {
    if (!sourceImage) {
      setError("먼저 원본 이미지를 업로드해주세요.");
      return;
    }
    
    setIsGeneratingAll(true);
    setError(null);
    setGeneratedImages({});

    const timestamp = Date.now();
    const date = new Date(timestamp);
    const newFolderName = `캐릭터_시트_${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}-${date.getMinutes().toString().padStart(2, '0')}-${date.getSeconds().toString().padStart(2, '0')}`;
    setFolderName(newFolderName);

    const originalImageForHistory: GeneratedImage = {
      id: `${timestamp}-original`,
      src: sourceImage.url,
      name: 'Original',
      folder: newFolderName,
      timestamp: timestamp,
    };
    addToHistory(originalImageForHistory);

    const initialLoadingStates: LoadingStates = {};
    CHARACTER_SHEET_VIEWS.forEach(view => initialLoadingStates[view.id] = true);
    setLoadingStates(initialLoadingStates);

    const generationPromises = CHARACTER_SHEET_VIEWS.map(view => 
      editImageWithNanoBanana(sourceImage.data, sourceImage.mime, view.prompt)
        .then(newImageSrc => {
          const newImage: GeneratedImage = {
            id: `${timestamp}-${view.id}`,
            src: newImageSrc,
            name: view.name,
            folder: newFolderName,
            timestamp: timestamp,
          };
          addToHistory(newImage);
          setGeneratedImages(prev => ({ ...prev, [view.id]: newImage }));
          setLoadingStates(prev => ({ ...prev, [view.id]: false }));
        })
        .catch(err => {
          console.error(`Failed to generate ${view.name}:`, err);
          setError(`${view.name} 생성에 실패했습니다. 다시 시도해주세요.`);
          setLoadingStates(prev => ({ ...prev, [view.id]: false }));
        })
    );
    
    await Promise.all(generationPromises);
    setIsGeneratingAll(false);

  }, [sourceImage, addToHistory]);

  return (
    <div className="space-y-6">
      <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold mb-4">1. 원본 캐릭터 이미지 업로드</h2>
        <div className="flex items-center space-x-6">
          <div 
            className={`w-48 h-48 bg-[var(--bg-tertiary)] rounded-lg flex items-center justify-center border-2 border-dashed ${isDraggingOver ? 'border-[var(--border-accent)] bg-[var(--bg-interactive)]' : 'border-[var(--border-secondary)]'} transition-colors relative`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {sourceImage ? (
              <img src={sourceImage.url} alt="Original character" className="w-full h-full object-cover rounded-md" />
            ) : (
              <p className="text-[var(--text-secondary)] text-sm text-center p-2">이미지를 드래그 &amp; 드롭 또는 붙여넣기</p>
            )}
            {isDraggingOver && <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg"><p className="text-white font-bold">이미지 놓기</p></div>}
          </div>
          <div className="flex-1">
            <label htmlFor="file-upload" className="cursor-pointer bg-[var(--bg-accent)] text-[var(--text-on-accent)] font-bold py-2 px-4 rounded-lg hover:bg-[var(--bg-accent-hover)] transition-colors">
              이미지 선택
            </label>
            <input id="file-upload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
            <p className="text-[var(--text-secondary)] mt-2 text-sm">시작하려면 캐릭터 이미지를 업로드하세요.</p>
            {error && <p className="text-[var(--bg-negative)] mt-2">{error}</p>}
          </div>
        </div>
      </div>

      <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold mb-4">2. 캐릭터 시트 생성</h2>
        <p className="text-[var(--text-secondary)] mb-4">아래 버튼을 클릭하여 캐릭터 시트의 모든 뷰를 생성하거나, 결과 그리드에서 개별 뷰를 클릭하여 하나씩 생성할 수 있습니다.</p>
        <button 
          onClick={handleGenerateSheet}
          disabled={!sourceImage || isGeneratingAll}
          className="bg-[var(--bg-positive)] text-[var(--text-on-accent)] font-bold py-3 px-6 rounded-lg hover:bg-[var(--bg-positive-hover)] transition-colors disabled:bg-[var(--bg-disabled)] disabled:cursor-not-allowed flex items-center"
        >
          {isGeneratingAll && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>}
          {isGeneratingAll ? '생성 중...' : '전체 시트 생성'}
        </button>
      </div>

      <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
        <h2 className="text-2xl font-bold mb-4">3. 결과</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {CHARACTER_SHEET_VIEWS.map(view => {
            const image = generatedImages[view.id];
            const isLoading = loadingStates[view.id] || isGeneratingAll;
            return (
              <ImageCard 
                key={view.id}
                name={view.name}
                image={image}
                isLoading={isLoading}
                onClick={() => {
                  if (isLoading) return;
                  if (image) {
                    onImageClick(image);
                  } else {
                    handleGenerateSingleView(view);
                  }
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};