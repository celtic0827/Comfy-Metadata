import * as React from 'react';
import { useState } from 'react';
import { ComfyFile } from '../types';
import { 
  Sparkles, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Check, 
  Maximize2, 
  ThumbsUp, 
  ThumbsDown,
  Trash2
} from 'lucide-react';

interface GridItemProps {
  file: ComfyFile;
  onClick: () => void;
  onDelete?: () => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export const GridItem: React.FC<GridItemProps> = ({ 
  file, 
  onClick, 
  onDelete,
  selectionMode = false, 
  isSelected = false, 
  onToggleSelect 
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'pos' | 'neg'>('idle');

  const handleCopy = (e: React.MouseEvent, type: 'pos' | 'neg') => {
    e.stopPropagation();
    const text = type === 'pos' ? file.positivePrompt : file.negativePrompt;
    
    if (text) {
      navigator.clipboard.writeText(text);
      setCopyState(type);
      setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("Delete clicked for", file.id);
    if (onDelete && confirm('Delete this file?')) {
      onDelete();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (selectionMode && onToggleSelect) {
      e.stopPropagation();
      onToggleSelect();
    } else {
      onClick();
    }
  };

  const hasPos = !!file.positivePrompt;
  const hasNeg = !!file.negativePrompt;

  return (
    <div 
      className={`
        group relative aspect-square bg-[#0a0a0a] border rounded-xl overflow-hidden cursor-pointer transition-all duration-300
        ${isSelected 
          ? 'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.5)]' 
          : 'border-gray-800 hover:border-blue-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.15)]'
        }
      `}
      onClick={handleClick}
    >
      {/* Thumbnail */}
      {file.previewUrl ? (
        file.type === 'video' ? (
          <video 
            src={file.previewUrl} 
            className={`w-full h-full object-cover transition-all duration-500 ${isSelected ? 'opacity-60 scale-95' : 'opacity-80 group-hover:opacity-100'}`} 
            muted 
          />
        ) : (
          <img 
            src={file.previewUrl} 
            className={`w-full h-full object-cover transition-all duration-500 ${isSelected ? 'opacity-60 scale-95' : 'opacity-80 group-hover:opacity-100'}`} 
            alt={file.fileName} 
          />
        )
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-800 bg-gray-925">
          <Sparkles size={24} />
        </div>
      )}
      
      {/* Top Overlay: Type & Action Buttons */}
      <div className="absolute top-0 left-0 right-0 p-2 flex justify-between items-start z-30 pointer-events-none">
          {/* Left: Type Icon & Status */}
          <div className="flex items-center gap-1.5 p-1.5 bg-black/40 backdrop-blur-md rounded-lg border border-white/5 shadow-sm">
               {file.type === 'video' ? <VideoIcon size={12} className="text-purple-400" /> : <ImageIcon size={12} className="text-blue-400" />}
               <div className={`w-1.5 h-1.5 rounded-full ${file.status === 'success' ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
          </div>

          {/* Right: Actions (Pointer events enabled) */}
          <div className="pointer-events-auto flex gap-2">
               {/* Selection Mode: Checkbox */}
               {selectionMode && (
                   <div className="mt-1 mr-1">
                        {isSelected ? (
                            <div className="bg-blue-500 text-white rounded-full p-0.5 shadow-sm">
                            <Check size={16} strokeWidth={3} />
                            </div>
                        ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-white/50 bg-black/20 backdrop-blur-sm hover:border-white hover:bg-black/40 transition-colors" />
                        )}
                   </div>
               )}

               {/* Normal Mode: Delete Button (Hover Only) */}
               {!selectionMode && onDelete && (
                    <button
                        onClick={handleDelete}
                        className="p-1.5 rounded-lg bg-black/60 hover:bg-red-500 text-gray-300 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md shadow-lg transform scale-90 group-hover:scale-100"
                        title="Delete File"
                    >
                        <Trash2 size={14} />
                    </button>
               )}
          </div>
      </div>

      {/* Bottom Actions Overlay - Copy Buttons */}
      {!selectionMode && (
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col gap-2 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-10">
          
          <div className="flex items-center gap-1.5">
            {/* Positive Copy */}
            <button
              disabled={!hasPos}
              onClick={(e) => handleCopy(e, 'pos')}
              className={`
                h-7 flex-1 rounded-md flex items-center justify-center transition-all duration-200 border
                ${!hasPos ? 'opacity-20 cursor-not-allowed border-transparent bg-gray-800' : ''}
                ${copyState === 'pos' 
                  ? 'bg-green-500 text-black border-green-500' 
                  : hasPos ? 'bg-gray-800/80 border-gray-700 text-green-500 hover:bg-green-500 hover:text-black hover:border-green-500' : ''}
              `}
              title="Copy Positive Prompt"
            >
              {copyState === 'pos' ? <Check size={14} strokeWidth={3} /> : <ThumbsUp size={14} />}
            </button>

            {/* Negative Copy */}
            <button
              disabled={!hasNeg}
              onClick={(e) => handleCopy(e, 'neg')}
              className={`
                h-7 flex-1 rounded-md flex items-center justify-center transition-all duration-200 border
                ${!hasNeg ? 'opacity-20 cursor-not-allowed border-transparent bg-gray-800' : ''}
                ${copyState === 'neg' 
                  ? 'bg-red-500 text-white border-red-500' 
                  : hasNeg ? 'bg-gray-800/80 border-gray-700 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500' : ''}
              `}
              title="Copy Negative Prompt"
            >
              {copyState === 'neg' ? <Check size={14} strokeWidth={3} /> : <ThumbsDown size={14} />}
            </button>
            
            {/* Details */}
            <button
              onClick={onClick}
              className="h-7 w-8 shrink-0 rounded-md flex items-center justify-center bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-500 hover:text-white transition-all duration-200"
              title="View Details"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};