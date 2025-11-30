
import * as React from 'react';
import { useState, useEffect } from 'react';
import { ComfyFile } from '../types';
import { X, Copy, Check, FileJson, FileText, Download, Trash2, Calendar, ExternalLink } from 'lucide-react';

interface DetailModalProps {
  file: ComfyFile;
  onClose: () => void;
  onDelete: (id: string) => void;
}

const renderWithLinks = (text: string) => {
  if (!text) return null;
  // Split by URL regex
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (part.match(/https?:\/\/[^\s]+/)) {
      return (
        <a 
          key={i} 
          href={part} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline align-baseline break-all"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={11} className="inline shrink-0 opacity-80" />
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

export const DetailModal: React.FC<DetailModalProps> = ({ file, onClose, onDelete }) => {
  const [activeTab, setActiveTab] = useState<'prompts' | 'raw'>('prompts');
  const [copiedPos, setCopiedPos] = useState(false);
  const [copiedNeg, setCopiedNeg] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const copyText = (text: string, setFn: (b: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  const handleDelete = () => {
    if (confirm('Delete this file?')) {
        onDelete(file.id);
        onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0 z-0" onClick={onClose} />
      
      <div className="relative z-10 w-full h-full md:h-[90vh] md:w-[95vw] md:max-w-7xl flex flex-col md:flex-row bg-[#050505] md:rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
        
        {/* Left: Media Preview */}
        <div className="flex-1 bg-black/50 relative flex items-center justify-center p-4 md:p-8 border-b md:border-b-0 md:border-r border-gray-800 min-h-[40vh]">
            {/* Pattern Background */}
            <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/dark-matter.png')] opacity-20 pointer-events-none"></div>
            
            {file.previewUrl && (
                file.type === 'video' ? (
                    <video 
                        src={file.previewUrl} 
                        controls 
                        className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                        autoPlay
                        loop 
                    />
                ) : (
                    <img 
                        src={file.previewUrl} 
                        alt={file.fileName} 
                        className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" 
                    />
                )
            )}
            
            {/* Mobile Close Button (Overlaid) */}
            <button onClick={onClose} className="md:hidden absolute top-4 right-4 p-2 bg-black/50 backdrop-blur rounded-full text-white">
                <X size={20} />
            </button>
        </div>

        {/* Right: Sidebar */}
        <div className="w-full md:w-[400px] lg:w-[450px] shrink-0 bg-[#0a0a0a] flex flex-col min-h-0">
            
            {/* Header */}
            <div className="p-5 border-b border-gray-800 bg-gray-900/20">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-sm font-medium text-white break-all line-clamp-2 font-mono" title={file.fileName}>
                            {file.fileName}
                        </h2>
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1.5">
                                <Calendar size={12} />
                                {new Date(file.createdAt).toLocaleDateString()}
                            </span>
                            <span className="uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-800 text-[10px]">
                                {file.type}
                            </span>
                        </div>
                    </div>
                    
                    {/* Desktop Close */}
                    <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex p-2 gap-2 border-b border-gray-800">
                <button
                    onClick={() => setActiveTab('prompts')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
                        activeTab === 'prompts' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                    }`}
                >
                    <FileText size={14} /> PROMPTS
                </button>
                <button
                    onClick={() => setActiveTab('raw')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
                        activeTab === 'raw' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                    }`}
                >
                    <FileJson size={14} /> RAW DATA
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
                
                {activeTab === 'prompts' && (
                    <>
                        {/* Positive */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Positive
                                </span>
                                {file.positivePrompt && (
                                    <button 
                                        onClick={() => copyText(file.positivePrompt || '', setCopiedPos)}
                                        className="text-gray-500 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
                                        title="Copy"
                                    >
                                        {copiedPos ? <Check size={14} className="text-green-500"/> : <Copy size={14} />}
                                    </button>
                                )}
                            </div>
                            <div className="bg-[#0f1115] border border-green-900/20 rounded-xl p-4 shadow-inner min-h-[100px]">
                                {file.positivePrompt ? (
                                    <p className="font-mono text-[13px] leading-6 text-green-100/80 whitespace-pre-wrap">
                                        {renderWithLinks(file.positivePrompt)}
                                    </p>
                                ) : (
                                    <p className="text-gray-600 text-xs italic">No positive prompt found.</p>
                                )}
                            </div>
                        </div>

                        {/* Negative */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> Negative
                                </span>
                                {file.negativePrompt && (
                                    <button 
                                        onClick={() => copyText(file.negativePrompt || '', setCopiedNeg)}
                                        className="text-gray-500 hover:text-white p-1 rounded hover:bg-gray-800 transition-colors"
                                        title="Copy"
                                    >
                                        {copiedNeg ? <Check size={14} className="text-green-500"/> : <Copy size={14} />}
                                    </button>
                                )}
                            </div>
                            <div className="bg-[#0f1115] border border-red-900/20 rounded-xl p-4 shadow-inner min-h-[80px]">
                                {file.negativePrompt ? (
                                    <p className="font-mono text-[13px] leading-6 text-red-100/80 whitespace-pre-wrap">
                                        {renderWithLinks(file.negativePrompt)}
                                    </p>
                                ) : (
                                    <p className="text-gray-600 text-xs italic">No negative prompt found.</p>
                                )}
                            </div>
                        </div>

                        {/* Other summaries */}
                        {(!file.positivePrompt && !file.negativePrompt && file.summary && file.summary.length > 0) && (
                            <div className="space-y-2">
                                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Extracted Text</div>
                                {file.summary.map((text, i) => (
                                    <div key={i} className="bg-gray-900 border border-gray-800 p-3 rounded-lg text-xs text-gray-400 font-mono">
                                        {renderWithLinks(text)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'raw' && (
                    <div className="relative group">
                         <button 
                            onClick={() => copyText(file.metadata || '', setCopiedRaw)}
                            className="absolute top-2 right-2 p-1.5 bg-gray-800 hover:bg-gray-700 rounded-md text-gray-400 hover:text-white transition-colors z-10"
                        >
                            {copiedRaw ? <Check size={14} className="text-green-500"/> : <Copy size={14} />}
                        </button>
                        <pre className="font-mono text-[10px] leading-4 text-gray-400 whitespace-pre-wrap bg-black/40 p-4 rounded-xl border border-gray-800 overflow-x-auto">
                            {file.metadata || 'No metadata available.'}
                        </pre>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-gray-800 bg-gray-900/30 flex gap-3">
                <button 
                    onClick={handleDelete}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-900/30 bg-red-500/5 text-red-500 hover:bg-red-500 hover:text-white transition-all text-xs font-medium"
                >
                    <Trash2 size={14} /> Delete
                </button>
                <a 
                    href={file.previewUrl} 
                    download={file.fileName}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-all text-xs font-medium"
                >
                    <Download size={14} /> Download
                </a>
            </div>
        </div>
      </div>
    </div>
  );
};
