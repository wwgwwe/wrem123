import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { CharacterSheetTool } from './components/CharacterSheetTool';
import { AngleChangeTool } from './components/AngleChangeTool';
import { PlaceholderTool } from './components/PlaceholderTool';
import { HistoryPanel } from './components/HistoryPanel';
import { ImageModal } from './components/ImageModal';
import { TOOLS } from './constants';
import type { ToolId, GeneratedImage, FinalSheetItem, SheetFormat, CosplayMainImage, CosplayRefImage, BgPropImage } from './types';
import { LightingColorTool } from './components/LightingColorTool';
import { PromptGeneratorTool } from './components/PromptGeneratorTool';
import { ExpressionPoseTool } from './components/ExpressionPoseTool';
import { FinalSheetTool } from './components/FinalSheetTool';
import { CosplayTool } from './components/CosplayTool';
import { BackgroundPropTool } from './components/BackgroundPropTool';
import { PromptLibraryTool } from './components/PromptLibraryTool';
import { StoryCreatorTool } from './components/StoryCreatorTool';
import { ProfilePhotoTool } from './components/ProfilePhotoTool';
import { InstagramGridPosterTool } from './components/InstagramGridPosterTool';
import { SnapshotGeneratorTool } from './components/SnapshotGeneratorTool';
import { StartEndFrameTool } from './components/StartEndFrameTool';
import { DEFAULT_THEME, THEMES } from './components/themes';
import type { Theme } from './components/themes';
import { editImageWithNanoBanana } from './services/geminiService';


// saveAs is loaded from a script in index.html
declare const saveAs: any;

const getImageWithAspectRatio = (img: GeneratedImage): Promise<{ img: GeneratedImage; aspectRatio: number }> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            if (image.naturalHeight === 0) {
                // Fallback for potential issues, though unlikely with data URLs
                resolve({ img, aspectRatio: 1 });
                return;
            }
            resolve({ img, aspectRatio: image.naturalWidth / image.naturalHeight });
        };
        image.onerror = () => {
            console.error(`Could not load image to determine aspect ratio: ${img.name}`);
            // Resolve with a default aspect ratio to prevent failure
            resolve({ img, aspectRatio: 1 });
        };
        image.src = img.src;
    });
};

const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = (err) => {
            console.error("Could not load image to get dimensions", err);
            // Resolve with 0s to avoid unhandled rejection, caller should handle this
            resolve({ width: 0, height: 0 });
        };
        image.src = url;
    });
};

function App() {
  const [activeToolId, setActiveToolId] = useState<ToolId>('snapshot-generator');
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [mainImage, setMainImage] = useState<string | null>(null);
  const [modalImage, setModalImage] = useState<GeneratedImage | null>(null);
  const [finalSheetImages, setFinalSheetImages] = useState<FinalSheetItem[]>([]);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  // State for FinalSheetTool lifted up
  const [sheetFormat, setSheetFormat] = useState<SheetFormat>('landscape');
  const [customFormat, setCustomFormat] = useState({ width: 1920, height: 1080 });
  const [bgColor, setBgColor] = useState('#FFFFFF');
  
  // State for CosplayTool lifted up
  const [cosplayMainImage, setCosplayMainImage] = useState<CosplayMainImage | null>(null);
  const [cosplayRefImage, setCosplayRefImage] = useState<CosplayRefImage | null>(null);
  const [cosplayMainPrompt, setCosplayMainPrompt] = useState(
    `Based on the first photo of the person, create a realistic, live-action version of the character from the second reference image. It is crucial to preserve the facial features and identity of the person in the first photo. Recreate the character's clothing, hairstyle, and overall mood photorealistically. The final image's atmosphere and lighting should be cinematic and match the specified background. The final result should look like a high-quality photograph of a real person cosplaying the character.`
  );
  const [cosplayBackgroundPrompt, setCosplayBackgroundPrompt] = useState('');
  const [cosplayGeneratedImage, setCosplayGeneratedImage] = useState<GeneratedImage | null>(null);

  // State for BackgroundPropTool lifted up
  const [bgPropMainImage, setBgPropMainImage] = useState<BgPropImage | null>(null);
  const [bgPropBackgrounds, setBgPropBackgrounds] = useState<(BgPropImage | null)[]>(Array(2).fill(null));
  const [bgPropProps, setBgPropProps] = useState<(BgPropImage | null)[]>(Array(3).fill(null));
  const [bgPropUserPrompt, setBgPropUserPrompt] = useState('');
  const [bgPropGeneratedImage, setBgPropGeneratedImage] = useState<GeneratedImage | null>(null);

  // State for StoryCreatorTool lifted up
  const [storyCreatorSourceImage, setStoryCreatorSourceImage] = useState<BgPropImage | null>(null);
  const [storyCreatorGeneratedImages, setStoryCreatorGeneratedImages] = useState<GeneratedImage[]>([]);

  useEffect(() => {
    const styleElement = document.getElementById('app-theme');
    if (styleElement) {
      const cssString = `:root { ${Object.entries(theme.colors).map(([key, value]) => `${key}: ${value};`).join(' ')} }`;
      styleElement.innerHTML = cssString;
    }
  }, [theme]);


  const addToHistory = useCallback((image: GeneratedImage) => {
    setHistory(prev => [image, ...prev]);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  const deleteFolderFromHistory = useCallback((folderName: string) => {
    setHistory(prev => prev.filter(image => image.folder !== folderName));
  }, []);

  const handleImageClick = useCallback((image: GeneratedImage) => {
    setModalImage(image);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalImage(null);
  }, []);

  const addMultipleToFinalSheet = useCallback(async (imagesToAdd: GeneratedImage[]) => {
    const imagesWithRatios = await Promise.all(
        imagesToAdd.map(getImageWithAspectRatio)
    );

    const formatRatios: Record<Exclude<SheetFormat, 'custom'>, number> = {
        landscape: 16 / 9,
        portrait: 9 / 16,
        square: 1 / 1,
    };
    const sheetAspectRatio = sheetFormat === 'custom'
        ? customFormat.width / customFormat.height
        : formatRatios[sheetFormat];

    setFinalSheetImages(prev => {
        const availableSlots = 10 - prev.length;
        if (availableSlots <= 0) {
            alert("최대 10장까지 추가할 수 있습니다.");
            return prev;
        }

        const newImages = imagesWithRatios
            .filter(({ img }) => !prev.some(existing => existing.src === img.src))
            .slice(0, availableSlots);

        if (newImages.length === 0) {
            return prev;
        }

        if (newImages.length < imagesToAdd.length) {
            alert(`최대 10장까지만 추가할 수 있습니다. ${newImages.length}개의 이미지만 추가됩니다.`);
        }
        
        const highestZIndex = Math.max(0, ...prev.map(item => item.zIndex));
        
        const newItems: FinalSheetItem[] = newImages.map(({ img, aspectRatio }, index) => {
            aspectRatio = aspectRatio || 1;
            const DEFAULT_WIDTH = 25;
            const MAX_DIMENSION = 90; // Max height or width as a percentage of the container

            let newWidth = DEFAULT_WIDTH;
            // The height in percentage of the container's height is (width_percentage * sheet_aspect_ratio) / image_aspect_ratio
            const calculatedHeight = (newWidth * sheetAspectRatio) / aspectRatio;
            
            // If image is too tall for its default width, scale it down to fit MAX_DIMENSION height
            if (calculatedHeight > MAX_DIMENSION) {
                newWidth = (MAX_DIMENSION * aspectRatio) / sheetAspectRatio;
            }

            // If image is too wide, scale it down to fit MAX_DIMENSION width
            if (newWidth > MAX_DIMENSION) {
                newWidth = MAX_DIMENSION;
            }
            
            // Ensure width is not excessively small for very tall images in landscape sheets
            newWidth = Math.max(newWidth, 10);

            return {
                id: img.id,
                src: img.src,
                name: img.name,
                x: 2 + (index * 2), // Staggered placement at top-left
                y: 2 + (index * 2),
                width: newWidth,
                zIndex: highestZIndex + index + 1,
                aspectRatio: aspectRatio,
            };
        });
        
        return [...prev, ...newItems];
    });
  }, [sheetFormat, customFormat]);
  
  const updateFinalSheetItem = useCallback((id: string, updates: Partial<Omit<FinalSheetItem, 'id' | 'src' | 'name' | 'aspectRatio'>>) => {
    setFinalSheetImages(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  }, []);

  const bringToFront = useCallback((id: string) => {
    setFinalSheetImages(prev => {
      const currentItem = prev.find(item => item.id === id);
      if (!currentItem) return prev;
      
      const maxZIndex = Math.max(...prev.map(i => i.zIndex));
      if (currentItem.zIndex === maxZIndex) return prev; // Already at the front

      return prev.map(item => item.id === id ? { ...item, zIndex: maxZIndex + 1 } : item);
    });
  }, []);

  const handleAutoArrange = useCallback(() => {
    setFinalSheetImages(prev => {
        const numItems = prev.length;
        if (numItems === 0) return prev;

        const cols = Math.ceil(Math.sqrt(numItems));
        const rows = Math.ceil(numItems / cols);

        const cellWidthPercent = 100 / cols;
        const cellHeightPercent = 100 / rows;

        const formatRatios: Record<Exclude<SheetFormat, 'custom'>, number> = {
            landscape: 16 / 9,
            portrait: 9 / 16,
            square: 1 / 1,
        };
        const containerAspectRatio = sheetFormat === 'custom'
            ? customFormat.width / customFormat.height
            : formatRatios[sheetFormat];

        // The effective aspect ratio of a grid cell in pixels
        const cellAspectRatio = (cellWidthPercent / cellHeightPercent) * containerAspectRatio;
        
        const padding = 0.9; // 90% of the cell size

        return prev.map((item, index) => {
            const col = index % cols;
            const row = Math.floor(index / cols);

            let newWidthPercent, newHeightPercent;

            if (item.aspectRatio > cellAspectRatio) {
                // Image is wider than the cell, so width should fill the cell (with padding)
                newWidthPercent = cellWidthPercent * padding;
                // Calculate height based on new width and image's own aspect ratio
                newHeightPercent = (newWidthPercent / item.aspectRatio) * containerAspectRatio;
            } else {
                // Image is taller than or same aspect as the cell, so height should fill the cell (with padding)
                newHeightPercent = cellHeightPercent * padding;
                // Calculate width based on new height and image's own aspect ratio
                newWidthPercent = (newHeightPercent * item.aspectRatio) / containerAspectRatio;
            }
            
            // Center the image within its grid cell
            const newX = col * cellWidthPercent + (cellWidthPercent - newWidthPercent) / 2;
            const newY = row * cellHeightPercent + (cellHeightPercent - newHeightPercent) / 2;

            return {
                ...item,
                x: newX,
                y: newY,
                width: newWidthPercent,
            };
        });
    });
  }, [sheetFormat, customFormat]);


  const removeFromFinalSheet = useCallback((imageId: string) => {
    setFinalSheetImages(prev => prev.filter(img => img.id !== imageId));
  }, []);

  const clearFinalSheet = useCallback(() => {
    setFinalSheetImages([]);
  }, []);

  const handleSendToTool = useCallback(async (toolId: ToolId) => {
    if (modalImage) {
        if (toolId === 'final-sheet') {
            addMultipleToFinalSheet([modalImage]);
            setActiveToolId('final-sheet');
        } else if (toolId === 'cosplay') {
            const mime = modalImage.src.substring(modalImage.src.indexOf(':') + 1, modalImage.src.indexOf(';'));
            const data = modalImage.src.substring(modalImage.src.indexOf(',') + 1);
            try {
                const { width, height } = await getImageDimensions(modalImage.src);
                const aspectRatio = width > 0 && height > 0 ? width / height : 1;
                setCosplayMainImage({ data, mime, url: modalImage.src, aspectRatio });
            } catch (e) {
                 setCosplayMainImage({ data, mime, url: modalImage.src, aspectRatio: 1 });
            }
            setActiveToolId(toolId);
        } else if (toolId === 'background-prop') {
            const mime = modalImage.src.substring(modalImage.src.indexOf(':') + 1, modalImage.src.indexOf(';'));
            const data = modalImage.src.substring(modalImage.src.indexOf(',') + 1);
            setBgPropMainImage({ data, mime, url: modalImage.src });
            setActiveToolId(toolId);
        } else if (toolId === 'story-creator') {
            const mime = modalImage.src.substring(modalImage.src.indexOf(':') + 1, modalImage.src.indexOf(';'));
            const data = modalImage.src.substring(modalImage.src.indexOf(',') + 1);
            setStoryCreatorSourceImage({ data, mime, url: modalImage.src });
            setActiveToolId(toolId);
        } else {
            setMainImage(modalImage.src);
            setActiveToolId(toolId);
        }
        setModalImage(null);
    }
  }, [modalImage, addMultipleToFinalSheet]);

  const handleDownloadImage = useCallback((image: GeneratedImage) => {
    const sanitize = (str: string) => {
      return str
        .toLowerCase()
        // Allow letters, numbers, Korean chars, whitespace, hyphen, underscore. Remove others.
        .replace(/[^a-z0-9ㄱ-ㅎㅏ-ㅣ가-힣\s\-_]/g, '')
        .trim()
        // Replace whitespace, hyphens, and underscores with a single underscore.
        .replace(/[\s\-_]+/g, '_');
    };

    const fileName = `${sanitize(image.folder)}_${sanitize(image.name)}.png`;
    fetch(image.src)
        .then(res => res.blob())
        .then(blob => saveAs(blob, fileName));
  }, []);

  // Callbacks for modal navigation
  const handleNextImage = useCallback(() => {
      if (!modalImage || history.length <= 1) return;
      const currentIndex = history.findIndex(img => img.id === modalImage.id);
      if (currentIndex === -1) return;
      const nextIndex = (currentIndex + 1) % history.length;
      setModalImage(history[nextIndex]);
  }, [modalImage, history]);

  const handlePrevImage = useCallback(() => {
      if (!modalImage || history.length <= 1) return;
      const currentIndex = history.findIndex(img => img.id === modalImage.id);
      if (currentIndex === -1) return;
      const prevIndex = (currentIndex - 1 + history.length) % history.length;
      setModalImage(history[prevIndex]);
  }, [modalImage, history]);

  // Effect for keyboard navigation
  useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
          if (!modalImage) return;
          if (event.key === 'ArrowRight') {
              handleNextImage();
          } else if (event.key === 'ArrowLeft') {
              handlePrevImage();
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
      };
  }, [modalImage, handleNextImage, handlePrevImage]);
  
  // Callback for in-modal editing
  const handleEditInModal = useCallback(async (originalImage: GeneratedImage, prompt: string) => {
    const mime = originalImage.src.substring(originalImage.src.indexOf(':') + 1, originalImage.src.indexOf(';'));
    const data = originalImage.src.substring(originalImage.src.indexOf(',') + 1);

    try {
        const newImageSrc = await editImageWithNanoBanana(data, mime, prompt);
        const newImage: GeneratedImage = {
            id: `${Date.now()}-edited`,
            src: newImageSrc,
            name: `${originalImage.name} (편집됨)`,
            folder: originalImage.folder,
            timestamp: Date.now(),
        };
        addToHistory(newImage);
        setModalImage(newImage);
    } catch (error) {
        console.error("Failed to edit image in modal", error);
        throw error;
    }
  }, [addToHistory]);


  const renderActiveTool = () => {
    switch (activeToolId) {
      case 'character-sheet':
        return <CharacterSheetTool addToHistory={addToHistory} sourceImage={mainImage} onImageClick={handleImageClick} />;
      case 'lighting-color':
        return <LightingColorTool addToHistory={addToHistory} sourceImage={mainImage} onImageClick={handleImageClick} />;
      case 'angle-change':
        return <AngleChangeTool addToHistory={addToHistory} sourceImage={mainImage} onImageClick={handleImageClick} />;
      case 'expression-pose':
        return <ExpressionPoseTool addToHistory={addToHistory} sourceImage={mainImage} onImageClick={handleImageClick} />;
      case 'prompt-generator':
        return <PromptGeneratorTool />;
      case 'cosplay':
        return <CosplayTool 
                    addToHistory={addToHistory} 
                    // Fix: Pass the `handleImageClick` function instead of the undefined `onImageClick` variable.
                    onImageClick={handleImageClick}
                    mainImage={cosplayMainImage}
                    onMainImageChange={setCosplayMainImage}
                    refImage={cosplayRefImage}
                    onRefImageChange={setCosplayRefImage}
                    mainPrompt={cosplayMainPrompt}
                    onMainPromptChange={setCosplayMainPrompt}
                    backgroundPrompt={cosplayBackgroundPrompt}
                    onBackgroundPromptChange={setCosplayBackgroundPrompt}
                    generatedImage={cosplayGeneratedImage}
                    onGeneratedImageChange={setCosplayGeneratedImage}
                />;
      case 'background-prop':
        return <BackgroundPropTool
            addToHistory={addToHistory}
            onImageClick={handleImageClick}
            mainImage={bgPropMainImage}
            onMainImageChange={setBgPropMainImage}
            backgrounds={bgPropBackgrounds}
            onBackgroundsChange={setBgPropBackgrounds}
            propsImages={bgPropProps}
            onPropsImagesChange={setBgPropProps}
            userPrompt={bgPropUserPrompt}
            onUserPromptChange={setBgPropUserPrompt}
            generatedImage={bgPropGeneratedImage}
            onGeneratedImageChange={setBgPropGeneratedImage}
        />;
      case 'prompt-library':
        return <PromptLibraryTool addToHistory={addToHistory} onImageClick={handleImageClick} />;
      case 'story-creator':
        return <StoryCreatorTool 
          addToHistory={addToHistory}
          onImageClick={handleImageClick}
          sourceImage={storyCreatorSourceImage}
          onSourceImageChange={setStoryCreatorSourceImage}
          generatedImages={storyCreatorGeneratedImages}
          onGeneratedImagesChange={setStoryCreatorGeneratedImages}
        />;
      case 'profile-photo':
        return <ProfilePhotoTool addToHistory={addToHistory} onImageClick={handleImageClick} />;
      case 'instagram-grid-poster':
        return <InstagramGridPosterTool addToHistory={addToHistory} />;
      case 'snapshot-generator':
        return <SnapshotGeneratorTool addToHistory={addToHistory} onImageClick={handleImageClick} />;
      case 'start-end-frame':
        return <StartEndFrameTool addToHistory={addToHistory} onImageClick={handleImageClick} />;
      case 'final-sheet':
        return <FinalSheetTool 
                    items={finalSheetImages} 
                    onRemove={removeFromFinalSheet} 
                    onClear={clearFinalSheet} 
                    onAdd={addMultipleToFinalSheet}
                    onUpdateItem={updateFinalSheetItem}
                    onBringToFront={bringToFront}
                    sheetFormat={sheetFormat}
                    onSheetFormatChange={setSheetFormat}
                    customFormat={customFormat}
                    onCustomFormatChange={setCustomFormat}
                    bgColor={bgColor}
                    onBgColorChange={setBgColor}
                    onAutoArrange={handleAutoArrange}
                />;
      default:
        return <PlaceholderTool title="Select a tool" />;
    }
  };

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans">
      <Sidebar 
        activeToolId={activeToolId} 
        setActiveToolId={setActiveToolId} 
        themes={THEMES}
        activeTheme={theme}
        setTheme={setTheme}
      />
      <main className="flex-1 p-8 overflow-y-auto">
        {renderActiveTool()}
      </main>
      <HistoryPanel 
        history={history} 
        onImageClick={handleImageClick}
        clearHistory={clearHistory}
        deleteFolder={deleteFolderFromHistory}
      />
      <ImageModal
        image={modalImage}
        onClose={handleCloseModal}
        onSendToTool={handleSendToTool}
        onDownload={() => modalImage && handleDownloadImage(modalImage)}
        onNextImage={handleNextImage}
        onPrevImage={handlePrevImage}
        historyLength={history.length}
        onEdit={handleEditInModal}
      />
    </div>
  );
}

export default App;