import { ImagePlus, Loader2, Sparkles } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { cn } from '../lib/utils';

type ShowroomPanelProps = {
  isGenerating: boolean;
  roomPreviewUrl: string | null;
  resultImageUrl: string | null;
  error: string | null;
  onFileSelected: (file: File) => void;
};

const formatFileSize = (size: number) => {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`;
  }
  return `${Math.round(size / 104857.6) / 10} MB`;
};

export function ShowroomPanel({
  isGenerating,
  roomPreviewUrl,
  resultImageUrl,
  error,
  onFileSelected,
}: ShowroomPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastFileMeta, setLastFileMeta] = useState<{ name: string; size: number } | null>(null);

  const helperCopy = useMemo(() => {
    if (isGenerating) {
      return 'Rendering your table into the room scene...';
    }
    if (resultImageUrl) {
      return 'Drop another room photo to regenerate.';
    }
    return 'Drop a room photo here to stage the current table.';
  }, [isGenerating, resultImageUrl]);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setLastFileMeta({ name: file.name, size: file.size });
    onFileSelected(file);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#f8f3eb]/96 backdrop-blur-[4px]">
      <div className="flex items-center justify-between border-b border-[#42241C] px-8 py-5">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-[#e63b2e]">Showroom AI</div>
          <div className="mt-2 font-serif text-[14px] text-[#5a4d43]">
            Stage the current table directly into your room.
          </div>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="border border-[#42241C] bg-[#5a3022] px-4 py-3 font-mono text-[8px] uppercase tracking-[0.16em] text-[#fbf6ef] transition-colors duration-150 hover:bg-[#714131]"
        >
          Upload Room
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="border-r border-[#42241C] px-8 py-7">
          <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#8f867a]">Input</div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              handleFiles(event.dataTransfer.files);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={cn(
              'mt-4 flex min-h-[260px] cursor-pointer flex-col justify-between border border-dashed px-5 py-5 transition-all duration-200',
              isDragging
                ? 'border-[#e63b2e] bg-[#f3e7db]'
                : 'border-[#cdb9a5] bg-[#fcfaf6] hover:border-[#9f866f] hover:bg-[#f5ede2]',
            )}
          >
            <div>
              <div className="flex items-center gap-3 text-[#42241C]">
                <ImagePlus className="h-4 w-4 text-[#e63b2e]" />
                <span className="font-mono text-[9px] uppercase tracking-[0.18em]">Room Image</span>
              </div>
              <div className="mt-4 font-serif text-[13px] leading-6 text-[#8f867a]">{helperCopy}</div>
            </div>

            {roomPreviewUrl ? (
              <div className="mt-5 overflow-hidden border border-[#d7c8b5] bg-[#f4ede3]">
                <img src={roomPreviewUrl} alt="Room preview" className="h-[180px] w-full object-cover" />
              </div>
            ) : (
              <div className="mt-5 flex h-[180px] items-center justify-center border border-[#d7c8b5] bg-[radial-gradient(circle_at_top,#f5ede2,transparent_65%)]">
                <div className="text-center">
                  <Sparkles className="mx-auto h-5 w-5 text-[#e63b2e]" />
                  <div className="mt-3 font-mono text-[8px] uppercase tracking-[0.16em] text-[#9f978d]">
                    Drag and drop to generate
                  </div>
                </div>
              </div>
            )}

            {lastFileMeta ? (
              <div className="mt-4 font-mono text-[7px] uppercase tracking-[0.14em] text-[#8f867a]">
                {lastFileMeta.name} / {formatFileSize(lastFileMeta.size)}
              </div>
            ) : null}
          </div>

          {error ? <div className="mt-4 font-serif text-[12px] leading-5 text-[#d98d84]">{error}</div> : null}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => handleFiles(event.target.files)}
          />
        </div>

        <div className="flex min-h-0 flex-col px-8 py-7">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-[#8f867a]">AI Output</div>
            {isGenerating ? (
              <div className="flex items-center gap-2 font-mono text-[8px] uppercase tracking-[0.16em] text-[#e63b2e]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex min-h-0 flex-1 items-center justify-center overflow-hidden border border-[#d7c8b5] bg-[radial-gradient(circle_at_top,#f8efe3,transparent_52%),linear-gradient(180deg,#fcfaf6,#efe4d6)]">
            {resultImageUrl ? (
              <img
                src={resultImageUrl}
                alt="AI showroom render"
                className={cn(
                  'h-full w-full object-contain transition-all duration-500',
                  isGenerating ? 'scale-[0.985] opacity-55 blur-[1px]' : 'scale-100 opacity-100 blur-0',
                )}
              />
            ) : (
              <div className="flex max-w-[420px] flex-col items-center px-8 text-center">
                {isGenerating ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-[#e63b2e]" />
                    <div className="mt-4 font-serif text-[16px] text-[#42241C]">Generating showroom composition</div>
                    <div className="mt-2 font-serif text-[13px] leading-6 text-[#8d8578]">
                      We are blending your uploaded space with the current table render.
                    </div>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-6 w-6 text-[#e63b2e]" />
                    <div className="mt-4 font-serif text-[16px] text-[#42241C]">Your staged room render will appear here</div>
                    <div className="mt-2 font-serif text-[13px] leading-6 text-[#8d8578]">
                      
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
