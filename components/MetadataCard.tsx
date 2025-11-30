import React, { useState } from 'react';
import { ComfyFile } from '../types';
import { Copy, Check, AlertCircle, FileJson, FileText, Image as ImageIcon, Video as VideoIcon, Database, Terminal } from 'lucide-react';

interface MetadataCardProps {
  item: ComfyFile;
  onDelete: (id: string) => void;
}

export const MetadataCard: React.FC<MetadataCardProps> = ({ item, onDelete }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'raw'>('summary');
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedPos, setCopiedPos] = useState(false);
  const [copiedNeg, setCopiedNeg] = useState(false);

  const handleCopyRaw = () => {
    if (!item.metadata) return;
    navigator.clipboard.writeText(item.metadata);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  const handleCopyText = (text: string, setCopied: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasStructure = !!item.positivePrompt || !!item.negativePrompt;
  const hasAnySummary = hasStructure || (item.summary && item.summary.length > 0);
  
  React.useEffect(() => {
    if (!hasAnySummary && item.status === 'success') {
        setActiveTab('raw');
    }
  }, [hasAnySummary, item.status]);

  return (
    <div className="bg-gray-925/80 backdrop-blur-sm border border-gray-800/60 rounded-xl overflow-hidden shadow-xl flex flex-col md:flex-row h-auto min-h-[380px] md:h-[420px] transition-all hover:border-gray-700 group">
      
      {/* Preview Section */}
      <div className="w-full md:w-[320px] shrink-0 bg-[#050505] flex items-center justify-center relative border-b md:border-b-0 md:border-r border-gray-800 h-64 md:h-auto select-none">
        {item.previewUrl ? (
          item.type === 'video' ? (
            <video 
              src={item.previewUrl} 
              controls 
              className="w-full h-full object-contain" 
              loop
              muted
            />
          ) : (
            <div className="w-full h-full relative p-2 flex items-center justify-center">
              <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/dark-matter.png')] opacity-20"></div>
              <img 
                src={item.previewUrl} 
                alt="Preview" 
                className="max-w-full max-h-full object-contain shadow-2xl rounded-sm" 
              />
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-700 gap-3">
             <Database size={32} className="opacity-20" />
             <span className="text-xs font-mono uppercase tracking-widest opacity-40">No Preview</span>
          </div>
        )}
        
        {/* Floating Filename */}
        <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-300 bg-black/40 backdrop-blur-md border border-white/10 px-2 py-1 rounded-lg w-fit">
                {item.type === 'video' ? <VideoIcon size={12} className="text-purple-400"/> : <ImageIcon size={12} className="text-blue-400"/>}
                <span className="truncate max-w-[180px] font-mono">{item.fileName}</span>
            </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-925/50">
        
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/50 bg-gray-900/30">
           <div className="flex bg-gray-900/80 p-0.5 rounded-lg border border-gray-800">
              <button 
                onClick={() => setActiveTab('summary')}
                disabled={!hasAnySummary}
                className={`px-3 py-1.5 text-xs font-medium rounded-[5px] flex items-center gap-2 transition-all
                  ${activeTab === 'summary' 
                    ? 'bg-gray-800 text-gray-100 shadow-sm' 
                    : hasAnySummary ? 'text-gray-500 hover:text-gray-300' : 'text-gray-700 cursor-not-allowed'}
                `}
              >
                <FileText size={12} /> <span className="mt-0.5">PROMPTS</span>
              </button>
              <button 
                onClick={() => setActiveTab('raw')}
                className={`px-3 py-1.5 text-xs font-medium rounded-[5px] flex items-center gap-2 transition-all
                  ${activeTab === 'raw' 
                    ? 'bg-gray-800 text-gray-100 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-300'}
                `}
              >
                <FileJson size={12} /> <span className="mt-0.5">JSON</span>
              </button>
           </div>

           <div className="flex items-center gap-2">
             {item.status === 'success' && activeTab === 'raw' && (
               <button 
                 onClick={handleCopyRaw}
                 className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
               >
                 {copiedRaw ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                 <span>Raw</span>
               </button>
             )}
             <div className="w-px h-4 bg-gray-800"></div>
             <button
                onClick={() => onDelete(item.id)}
                className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded-md hover:bg-red-500/10"
                title="Remove file"
             >
                <AlertCircle size={16} />
             </button>
           </div>
        </div>

        {/* Scroll Area */}
        <div className="flex-1 overflow-auto p-0 relative custom-scrollbar">
          {item.status === 'processing' && (
             <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-mono uppercase tracking-wider">Parsing...</span>
             </div>
          )}

          {item.status === 'error' && (
            <div className="flex flex-col items-center justify-center h-full text-red-400 gap-3 p-6 text-center">
              <div className="bg-red-500/10 p-3 rounded-full">
                  <AlertCircle size={24} />
              </div>
              <div>
                <p className="text-sm font-semibold">Extraction Failed</p>
                <p className="text-xs text-red-500/70 mt-1 font-mono">{item.errorMessage}</p>
              </div>
            </div>
          )}

          {item.status === 'success' && item.metadata && (
             <>
               {activeTab === 'summary' && (
                 <div className="p-5 space-y-6">
                    
                    {/* Positive Prompt */}
                    {item.positivePrompt && (
                      <div className="relative group/section">
                         <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-green-500/90 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                Positive
                            </span>
                            <button 
                               onClick={() => handleCopyText(item.positivePrompt || '', setCopiedPos)}
                               className="opacity-0 group-hover/section:opacity-100 transition-opacity p-1 hover:bg-white/5 rounded text-gray-400 hover:text-white"
                            >
                               {copiedPos ? <Check size={12} className="text-green-500"/> : <Copy size={12}/>}
                            </button>
                         </div>
                         <div className="bg-[#0a0d14] border border-green-500/10 rounded-lg p-3 max-h-40 overflow-y-auto custom-scrollbar shadow-inner">
                            <p className="font-mono text-[13px] leading-6 text-green-100/80 whitespace-pre-wrap">{item.positivePrompt}</p>
                         </div>
                      </div>
                    )}

                    {/* Negative Prompt */}
                    {item.negativePrompt && (
                      <div className="relative group/section">
                         <div className="flex items-center justify-between mb-2">
                             <span className="text-[10px] font-bold text-red-500/90 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                Negative
                            </span>
                            <button 
                               onClick={() => handleCopyText(item.negativePrompt || '', setCopiedNeg)}
                               className="opacity-0 group-hover/section:opacity-100 transition-opacity p-1 hover:bg-white/5 rounded text-gray-400 hover:text-white"
                            >
                               {copiedNeg ? <Check size={12} className="text-green-500"/> : <Copy size={12}/>}
                            </button>
                         </div>
                         <div className="bg-[#0a0d14] border border-red-500/10 rounded-lg p-3 max-h-40 overflow-y-auto custom-scrollbar shadow-inner">
                            <p className="font-mono text-[13px] leading-6 text-red-100/70 whitespace-pre-wrap">{item.negativePrompt}</p>
                         </div>
                      </div>
                    )}

                    {!hasStructure && item.summary && item.summary.length > 0 && (
                        <div className="space-y-4">
                           <div className="flex items-center gap-2 text-gray-500 pb-2 border-b border-gray-800">
                               <Terminal size={14} />
                               <span className="text-xs font-mono uppercase">Unstructured Text</span>
                           </div>
                           {item.summary.map((text, idx) => (
                              <div key={idx} className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 relative group">
                                <div className="max-h-32 overflow-y-auto custom-scrollbar">
                                    <p className="font-mono text-xs text-gray-400 whitespace-pre-wrap pr-6">{text}</p>
                                </div>
                                <button 
                                  onClick={() => handleCopyText(text, () => {})}
                                  className="absolute top-2 right-2 p-1.5 bg-black/50 rounded hover:bg-black text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                                >
                                   <Copy size={12} />
                                </button>
                              </div>
                           ))}
                        </div>
                    )}
                 </div>
               )}

               {activeTab === 'raw' && (
                 <div className="p-0">
                    <pre className="p-4 font-mono text-[11px] text-gray-400 leading-5 tab-4">
                      {item.metadata}
                    </pre>
                 </div>
               )}
             </>
          )}
        </div>
      </div>
    </div>
  );
};