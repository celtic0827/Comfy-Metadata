
import * as React from 'react';
import { useEffect } from 'react';
import { RotateCcw, X } from 'lucide-react';

interface ToastProps {
  message: string;
  isVisible: boolean;
  onUndo?: () => void;
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ 
  message, 
  isVisible, 
  onUndo, 
  onClose, 
  duration = 5000 
}) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-4 py-3 bg-gray-900 border border-gray-800 text-gray-200 rounded-lg shadow-2xl shadow-black/50 animate-in slide-in-from-bottom-5 fade-in duration-300">
      <span className="text-sm font-medium">{message}</span>
      
      <div className="flex items-center gap-2 pl-3 border-l border-gray-700">
        {onUndo && (
          <button 
            onClick={onUndo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
          >
            <RotateCcw size={12} />
            UNDO
          </button>
        )}
        
        <button 
          onClick={onClose}
          className="p-1 hover:bg-gray-800 rounded-full text-gray-500 hover:text-white transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
