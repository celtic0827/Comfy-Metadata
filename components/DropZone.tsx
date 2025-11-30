import * as React from 'react';
import { useCallback, useState, useRef } from 'react';
import { Upload } from 'lucide-react';

interface DropZoneProps {
  onFilesDropped: (files: File[]) => void;
  className?: string;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFilesDropped, className }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter((file: File) => 
      file.type.startsWith('image/png') || 
      file.type.startsWith('video/mp4') ||
      file.name.endsWith('.png') || 
      file.name.endsWith('.mp4')
    );
    
    if (droppedFiles.length > 0) {
      onFilesDropped(droppedFiles);
    }
  }, [onFilesDropped]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      onFilesDropped(selectedFiles);
    }
  }, [onFilesDropped]);

  return (
    <div 
      className={`
        relative overflow-hidden rounded-xl transition-all duration-300 ease-out
        flex flex-col items-center justify-center text-center cursor-pointer group
        ${className || 'h-40'}
        ${isDragging 
          ? 'bg-blue-900/10 border-blue-500 scale-[1.01] shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)]' 
          : 'bg-gradient-to-br from-gray-900/80 to-gray-950/80 hover:bg-gray-900 border-gray-800 hover:border-gray-700'}
        border border-dashed
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => fileInputRef.current?.click()}
    >
      <input 
        ref={fileInputRef}
        type="file" 
        multiple 
        accept=".png,.mp4" 
        className="hidden" 
        onChange={handleFileInput}
      />
      
      {/* Background Decor */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />

      <div className="flex flex-col gap-3 relative z-10 px-4">
        <div className="flex items-center justify-center gap-4 text-gray-500 group-hover:text-blue-400 transition-colors">
           <Upload className={`w-8 h-8 transition-transform duration-300 ${isDragging ? '-translate-y-1' : ''}`} />
        </div>

        <div>
          <h3 className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
            Drop Files
          </h3>
          <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-mono">
            PNG / MP4
          </p>
        </div>
      </div>
    </div>
  );
};