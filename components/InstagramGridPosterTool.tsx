import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { GeneratedImage } from '../types';
import { editImageWithNanoBanana } from '../services/geminiService';

interface InstagramGridPosterToolProps {
  addToHistory: (image: GeneratedImage) => void;
}

const GRID_SIZES = [
    { cols: 3, rows: 1 }, { cols: 3, rows: 2 }, { cols: 3, rows: 3 },
    { cols: 3, rows: 4 }, { cols: 3, rows: 5 }, { cols: 3, rows: 6 }
];

const GridDisplayIcon: React.FC<{ cols: number; rows: number }> = ({ cols, rows }) => (
    <div className="flex flex-col items-center justify-center">
        <div className={`grid gap-0.5 w-6 h-6`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {[...Array(cols * rows)].map((_, i) => (
                <div key={i} className="bg-white/80 rounded-sm" />
            ))}
        </div>
        <span className="text-xs mt-1">{cols} x {rows}</span>
    </div>
);


export const InstagramGridPosterTool: React.FC<InstagramGridPosterToolProps> = ({ addToHistory }) => {
    const [sourceImage, setSourceImage] = useState<{ url: string; element: HTMLImageElement } | null>(null);
    const [prompt, setPrompt] = useState('이 이미지의 디테일을 향상시키고 더욱 선명하게 만들어주세요.');
    const [gridSize, setGridSize] = useState(GRID_SIZES[1]);
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [fillEmpty, setFillEmpty] = useState(true);

    const [isGenerating, setIsGenerating] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    
    const imageContainerRef = useRef<HTMLDivElement>(null);
    const panState = useRef({ isPanning: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

    const resetState = () => {
        setSourceImage(null);
        setPrompt('이 이미지의 디테일을 향상시키고 더욱 선명하게 만들어주세요.');
        setGridSize(GRID_SIZES[1]);
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setFillEmpty(true);
    };

    const processFile = (file: File) => {
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const url = e.target?.result as string;
            const img = new Image();
            img.onload = () => {
                // Keep some settings, but reset framing
                setSourceImage({ url, element: img });
                setScale(1);
                setPosition({ x: 0, y: 0 });
            };
            img.src = url;
        };
        reader.readAsDataURL(file);
    };
    
    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const file = event.clipboardData?.items?.[0]?.getAsFile();
            if (file) processFile(file);
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    const onMouseDown = (e: React.MouseEvent) => {
        if (!sourceImage) return;
        panState.current = { isPanning: true, startX: e.clientX, startY: e.clientY, startPosX: position.x, startPosY: position.y };
        if (imageContainerRef.current) imageContainerRef.current.style.cursor = 'grabbing';
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (!panState.current.isPanning || !sourceImage) return;
        const dx = e.clientX - panState.current.startX;
        const dy = e.clientY - panState.current.startY;
        setPosition({
            x: panState.current.startPosX + dx,
            y: panState.current.startPosY + dy,
        });
    };

    const onMouseUpOrLeave = () => {
        panState.current.isPanning = false;
        if (imageContainerRef.current) imageContainerRef.current.style.cursor = sourceImage ? 'grab' : 'default';
    };

    const handleGenerate = async () => {
        if (!sourceImage || !imageContainerRef.current) return;
    
        setIsGenerating(true);
    
        const container = imageContainerRef.current;
        const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
    
        const TARGET_SLICE_MIN_DIM = 720;
        const targetResolution = TARGET_SLICE_MIN_DIM * Math.max(gridSize.cols, gridSize.rows);
        const resolutionScale = targetResolution / containerWidth;
    
        const mainCanvas = document.createElement('canvas');
        mainCanvas.width = targetResolution;
        mainCanvas.height = targetResolution;
        const ctx = mainCanvas.getContext('2d');
    
        if (!ctx) {
            setIsGenerating(false);
            return;
        }
    
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, mainCanvas.width, mainCanvas.height);
    
        if (fillEmpty) {
            ctx.filter = 'blur(20px) brightness(0.6)';
            const imgAspect = sourceImage.element.width / sourceImage.element.height;
            const containerAspect = containerWidth / containerHeight;
            let bgWidth, bgHeight, bgX, bgY;
            if (imgAspect > containerAspect) {
                bgHeight = containerHeight;
                bgWidth = bgHeight * imgAspect;
                bgX = (containerWidth - bgWidth) / 2;
                bgY = 0;
            } else {
                bgWidth = containerWidth;
                bgHeight = bgWidth / imgAspect;
                bgY = (containerHeight - bgHeight) / 2;
                bgX = 0;
            }
            ctx.drawImage(sourceImage.element, bgX * resolutionScale, bgY * resolutionScale, bgWidth * resolutionScale, bgHeight * resolutionScale);
            ctx.filter = 'none';
        }
    
        const dWidth = sourceImage.element.width * scale * resolutionScale;
        const dHeight = sourceImage.element.height * scale * resolutionScale;
        const dx = (containerWidth / 2 + position.x) * resolutionScale - dWidth / 2;
        const dy = (containerHeight / 2 + position.y) * resolutionScale - dHeight / 2;
        ctx.drawImage(sourceImage.element, dx, dy, dWidth, dHeight);

        try {
            const baseImageURL = mainCanvas.toDataURL('image/jpeg', 0.95);
            const [header, base64Data] = baseImageURL.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
            
            const regeneratedImageURL = await editImageWithNanoBanana(base64Data, mimeType, prompt);

            const regeneratedImg = new Image();
            regeneratedImg.onload = () => {
                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = regeneratedImg.width;
                finalCanvas.height = regeneratedImg.height;
                const finalCtx = finalCanvas.getContext('2d');
                if (!finalCtx) {
                    setIsGenerating(false);
                    return;
                }
                finalCtx.drawImage(regeneratedImg, 0, 0);

                const sliceWidth = finalCanvas.width / gridSize.cols;
                const sliceHeight = finalCanvas.height / gridSize.rows;

                const timestamp = Date.now();
                const date = new Date(timestamp);
                const folderName = `인스타그리드_${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
                
                for (let row = 0; row < gridSize.rows; row++) {
                    for (let col = 0; col < gridSize.cols; col++) {
                        const sliceCanvas = document.createElement('canvas');
                        sliceCanvas.width = sliceWidth;
                        sliceCanvas.height = sliceHeight;
                        const sliceCtx = sliceCanvas.getContext('2d');
                        if (!sliceCtx) continue;

                        sliceCtx.drawImage(
                            finalCanvas,
                            col * sliceWidth,
                            row * sliceHeight,
                            sliceWidth,
                            sliceHeight,
                            0, 0,
                            sliceWidth, sliceHeight
                        );
                        
                        const sliceImage: GeneratedImage = {
                            id: `${timestamp}-grid-${row}-${col}`,
                            src: sliceCanvas.toDataURL('image/jpeg', 0.95),
                            name: `Grid_Post_${gridSize.rows - row}_${col + 1}`, // Reverse row for Insta order
                            folder: folderName,
                            timestamp: timestamp,
                        };
                        addToHistory(sliceImage);
                    }
                }
                alert(`${gridSize.cols * gridSize.rows}개의 이미지가 생성되어 작업 기록에 추가되었습니다. 작업 기록 패널에서 다운로드할 수 있습니다.`);

            };
            regeneratedImg.src = regeneratedImageURL;

        } catch (error) {
            console.error("Error generating grid poster", error);
            alert("이미지 생성에 실패했습니다. 다시 시도해주세요.");
        } finally {
            setIsGenerating(false);
        }
    };

    // Fix: Added a return statement with JSX to render the component UI.
    return (
        <div className="flex h-full gap-8">
            {/* Left panel for controls */}
            <aside className="w-[400px] flex-shrink-0 flex flex-col gap-6">
                <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
                    <h2 className="text-xl font-bold mb-1">인스타그램 그리드 포스터</h2>
                    <p className="text-[var(--text-secondary)] mb-4 text-sm">이미지를 여러 조각으로 나누어 인스타그램 피드를 꾸며보세요.</p>
                </div>

                {/* Step 1: Image Upload */}
                <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
                    <h3 className="text-lg font-semibold mb-3">1. 이미지 업로드</h3>
                    {sourceImage ? (
                        <button onClick={resetState} className="w-full bg-[var(--bg-negative)] text-[var(--text-on-accent)] font-bold py-2 px-4 rounded-lg hover:bg-[var(--bg-negative-hover)] transition-colors">
                            이미지 제거 및 초기화
                        </button>
                    ) : (
                        <label htmlFor="grid-file-upload" className="w-full block text-center cursor-pointer bg-[var(--bg-accent)] text-[var(--text-on-accent)] font-bold py-2 px-4 rounded-lg hover:bg-[var(--bg-accent-hover)] transition-colors">
                            이미지 선택
                            <input id="grid-file-upload" type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files && processFile(e.target.files[0])} />
                        </label>
                    )}
                </div>

                {/* Step 2: Prompt */}
                <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
                    <h3 className="text-lg font-semibold mb-3">2. 이미지 향상 프롬프트 (선택)</h3>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                        className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-secondary)] rounded-lg p-3 text-sm focus:ring-[var(--ring-accent)] focus:border-[var(--border-accent)]"
                        placeholder="예: 이 이미지의 채도를 높이고 더 생생하게 만들어주세요."
                    />
                </div>

                {/* Step 3: Grid Options */}
                <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl">
                    <h3 className="text-lg font-semibold mb-3">3. 그리드 옵션</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">그리드 크기</label>
                            <div className="grid grid-cols-3 gap-2">
                                {GRID_SIZES.map(size => (
                                    <button
                                        key={`${size.cols}x${size.rows}`}
                                        onClick={() => setGridSize(size)}
                                        className={`p-2 rounded-lg border-2 ${gridSize.cols === size.cols && gridSize.rows === size.rows ? 'bg-[var(--bg-accent)] border-[var(--border-accent)] text-[var(--text-on-accent)]' : 'bg-[var(--bg-tertiary)] border-[var(--border-secondary)] hover:border-[var(--border-accent)]'}`}
                                    >
                                        <GridDisplayIcon cols={size.cols} rows={size.rows} />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label htmlFor="fill-empty-toggle" className="flex items-center justify-between cursor-pointer">
                                <span className="text-sm font-medium">빈 공간 채우기</span>
                                <div className="relative">
                                    <input id="fill-empty-toggle" type="checkbox" className="sr-only" checked={fillEmpty} onChange={() => setFillEmpty(p => !p)} />
                                    <div className={`block w-10 h-6 rounded-full ${fillEmpty ? 'bg-[var(--bg-accent)]' : 'bg-[var(--bg-tertiary)]'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${fillEmpty ? 'translate-x-4' : ''}`}></div>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Step 4: Generate */}
                <div className="bg-[var(--bg-secondary)] p-6 rounded-lg shadow-xl mt-auto">
                    <button
                        onClick={handleGenerate}
                        disabled={!sourceImage || isGenerating}
                        className="w-full bg-[var(--bg-positive)] text-[var(--text-on-accent)] font-bold py-3 px-4 rounded-lg hover:bg-[var(--bg-positive-hover)] transition-colors disabled:bg-[var(--bg-disabled)] disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isGenerating ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div> : null}
                        {isGenerating ? '생성 중...' : '그리드 포스터 생성'}
                    </button>
                </div>
            </aside>

            {/* Right panel for preview */}
            <main className="flex-1 bg-[var(--bg-primary)] p-6 rounded-lg shadow-xl flex flex-col items-center justify-center">
                <div
                    ref={imageContainerRef}
                    className="w-full aspect-square max-w-[600px] bg-[var(--bg-tertiary)] rounded-lg overflow-hidden relative"
                    onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDraggingOver(false); }}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingOver(false);
                        if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
                    }}
                    onMouseDown={onMouseDown}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUpOrLeave}
                    onMouseLeave={onMouseUpOrLeave}
                    onWheel={(e) => {
                        if (!sourceImage) return;
                        const scaleAmount = -e.deltaY * 0.001;
                        setScale(prev => Math.max(0.1, prev + scaleAmount));
                    }}
                    style={{ cursor: panState.current.isPanning ? 'grabbing' : (sourceImage ? 'grab' : 'default') }}
                >
                    {!sourceImage ? (
                        <div className="w-full h-full flex items-center justify-center text-center text-[var(--text-secondary)]">
                            {isDraggingOver ? '이미지를 놓으세요' : '이미지를 업로드하거나 드롭하세요'}
                        </div>
                    ) : (
                        <>
                            {fillEmpty && (
                                <img
                                    src={sourceImage.url}
                                    className="absolute inset-0 w-full h-full object-cover filter blur-lg brightness-50"
                                    style={{ transform: 'scale(1.1)' }}
                                    alt="Background"
                                />
                            )}
                            <img
                                src={sourceImage.url}
                                alt="Source"
                                className="absolute top-1/2 left-1/2"
                                style={{
                                    transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${scale})`,
                                    willChange: 'transform',
                                    maxWidth: 'none',
                                }}
                            />
                            <div
                                className="absolute inset-0 grid pointer-events-none"
                                style={{
                                    gridTemplateColumns: `repeat(${gridSize.cols}, 1fr)`,
                                    gridTemplateRows: `repeat(${gridSize.rows}, 1fr)`,
                                }}
                            >
                                {[...Array(gridSize.cols * gridSize.rows)].map((_, i) => (
                                    <div key={i} className="border border-white/30" />
                                ))}
                            </div>
                        </>
                    )}
                </div>
                {sourceImage && <p className="text-xs text-[var(--text-secondary)] mt-2">마우스 휠로 확대/축소, 드래그하여 이동</p>}
            </main>
        </div>
    );
};
