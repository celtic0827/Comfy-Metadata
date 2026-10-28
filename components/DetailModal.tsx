import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { ComfyFile } from '../types';
import { extractGenerationParams, searchMetadataFields } from '../utils/comfyParser';
import { 
  X, 
  Copy, 
  Check, 
  FileJson, 
  FileText, 
  Download, 
  Trash2, 
  Calendar, 
  ExternalLink,
  Search,
  Sliders,
  Layers,
  Sparkles
} from 'lucide-react';

interface DetailModalProps {
  file: ComfyFile;
  onClose: () => void;
  onDelete: (id: string) => void;
}

const renderWithLinks = (text: string) => {
  if (!text) return null;
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
  const [activeTab, setActiveTab] = useState<'prompts' | 'inspector' | 'raw'>('prompts');
  const [copiedPos, setCopiedPos] = useState(false);
  const [copiedNeg, setCopiedNeg] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  
  // Keyword Search within node metadata
  const [searchQuery, setSearchQuery] = useState('');

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

  // Ensure params are available
  const params = useMemo(() => {
    return file.params || (file.metadata ? extractGenerationParams(file.metadata) : {});
  }, [file]);

  // Search results within metadata
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !file.metadata) return [];
    return searchMetadataFields(file.metadata, searchQuery);
  }, [file.metadata, searchQuery]);

  const handleCopyFormattedPrompt = () => {
    let doc = `File: ${file.fileName}\n`;
    if (params.checkpoint) doc += `Model: ${params.checkpoint}\n`;
    if (params.seed !== undefined) doc += `Seed: ${params.seed}\n`;
    if (params.steps) doc += `Steps: ${params.steps}\n`;
    if (params.cfg) doc += `CFG: ${params.cfg}\n`;
    if (params.sampler) doc += `Sampler: ${params.sampler}\n`;
    if (file.positivePrompt) doc += `\nPositive Prompt:\n${file.positivePrompt}\n`;
    if (file.negativePrompt) doc += `\nNegative Prompt:\n${file.negativePrompt}\n`;

    copyText(doc, setCopiedAll);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0 z-0" onClick={onClose} />
      
      <div className="relative z-10 w-full h-full md:h-[90vh] md:w-[95vw] md:max-w-7xl flex flex-col md:flex-row bg-[#050505] md:rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
        
        {/* Left: Media Preview */}
        <div className="flex-1 bg-black/50 relative flex items-center justify-center p-4 md:p-8 border-b md:border-b-0 md:border-r border-gray-800 min-h-[40vh]">
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
            
            {/* Mobile Close Button */}
            <button onClick={onClose} className="md:hidden absolute top-4 right-4 p-2 bg-black/50 backdrop-blur rounded-full text-white">
                <X size={20} />
            </button>
        </div>

        {/* Right: Sidebar */}
        <div className="w-full md:w-[420px] lg:w-[480px] shrink-0 bg-[#0a0a0a] flex flex-col min-h-0">
            
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
                            {params.checkpoint && (
                              <span className="truncate max-w-[150px] px-1.5 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-900/30 text-[10px] font-mono" title={params.checkpoint}>
                                {params.checkpoint}
                              </span>
                            )}
                        </div>
                    </div>
                    
                    {/* Desktop Close */}
                    <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex p-2 gap-2 border-b border-gray-800 bg-gray-900/10">
                <button
                    onClick={() => setActiveTab('prompts')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
                        activeTab === 'prompts' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                    }`}
                >
                    <FileText size={13} /> PROMPTS & PARAMS
                </button>

                <button
                    onClick={() => setActiveTab('inspector')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
                        activeTab === 'inspector' ? 'bg-gray-800 text-amber-300 shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                    }`}
                >
                    <Search size={13} /> 欄位關鍵字搜尋
                </button>

                <button
                    onClick={() => setActiveTab('raw')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
                        activeTab === 'raw' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                    }`}
                >
                    <FileJson size={13} /> RAW JSON
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
                
                {/* TAB 1: PROMPTS & PARAMETERS */}
                {activeTab === 'prompts' && (
                    <>
                        {/* Generation Parameters Grid */}
                        {(params.checkpoint || params.seed !== undefined || params.steps || params.cfg || params.sampler || (params.loras && params.loras.length > 0)) && (
                          <div className="space-y-2">
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                              <Sliders size={12} /> Generation Parameters
                            </span>
                            <div className="grid grid-cols-2 gap-2 bg-[#0c0d12] border border-gray-800 rounded-xl p-3 text-xs">
                              {params.checkpoint && (
                                <div className="col-span-2">
                                  <span className="text-gray-500 text-[10px] block">Model / Checkpoint</span>
                                  <span className="font-mono text-gray-200 text-[11px] break-all">{params.checkpoint}</span>
                                </div>
                              )}
                              {params.seed !== undefined && (
                                <div>
                                  <span className="text-gray-500 text-[10px] block">Seed</span>
                                  <span className="font-mono text-gray-200 text-[11px]">{params.seed}</span>
                                </div>
                              )}
                              {params.steps !== undefined && (
                                <div>
                                  <span className="text-gray-500 text-[10px] block">Steps</span>
                                  <span className="font-mono text-gray-200 text-[11px]">{params.steps}</span>
                                </div>
                              )}
                              {params.cfg !== undefined && (
                                <div>
                                  <span className="text-gray-500 text-[10px] block">CFG Scale</span>
                                  <span className="font-mono text-gray-200 text-[11px]">{params.cfg}</span>
                                </div>
                              )}
                              {params.sampler && (
                                <div>
                                  <span className="text-gray-500 text-[10px] block">Sampler</span>
                                  <span className="font-mono text-gray-200 text-[11px]">{params.sampler}</span>
                                </div>
                              )}
                              {params.scheduler && (
                                <div>
                                  <span className="text-gray-500 text-[10px] block">Scheduler</span>
                                  <span className="font-mono text-gray-200 text-[11px]">{params.scheduler}</span>
                                </div>
                              )}
                              {(params.width || params.height) && (
                                <div>
                                  <span className="text-gray-500 text-[10px] block">Resolution</span>
                                  <span className="font-mono text-gray-200 text-[11px]">{params.width} x {params.height}</span>
                                </div>
                              )}
                              {params.loras && params.loras.length > 0 && (
                                <div className="col-span-2 pt-1 border-t border-gray-800/80">
                                  <span className="text-gray-500 text-[10px] block mb-1">LoRAs</span>
                                  <div className="flex flex-wrap gap-1">
                                    {params.loras.map((lora, i) => (
                                      <span key={i} className="px-1.5 py-0.5 rounded bg-gray-800 text-purple-300 font-mono text-[10px]">
                                        {lora}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Positive Prompt */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> Positive Prompt
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
                            <div className="bg-[#0f1115] border border-green-900/20 rounded-xl p-4 shadow-inner min-h-[90px]">
                                {file.positivePrompt ? (
                                    <p className="font-mono text-[13px] leading-6 text-green-100/80 whitespace-pre-wrap select-text">
                                        {renderWithLinks(file.positivePrompt)}
                                    </p>
                                ) : (
                                    <p className="text-gray-600 text-xs italic">No positive prompt found.</p>
                                )}
                            </div>
                        </div>

                        {/* Negative Prompt */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div> Negative Prompt
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
                            <div className="bg-[#0f1115] border border-red-900/20 rounded-xl p-4 shadow-inner min-h-[70px]">
                                {file.negativePrompt ? (
                                    <p className="font-mono text-[13px] leading-6 text-red-100/80 whitespace-pre-wrap select-text">
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

                {/* TAB 2: FIELD KEYWORD SEARCH & INSPECTOR */}
                {activeTab === 'inspector' && (
                    <div className="space-y-4">
                      <div>
                        <span className="text-xs font-semibold text-gray-300 block mb-1">
                          經由關鍵字找出特定欄位 (Field Search)
                        </span>
                        <p className="text-[11px] text-gray-500 mb-2">
                          輸入任何關鍵字（如：<code className="text-amber-400">seed</code>, <code className="text-amber-400">model</code>, <code className="text-amber-400">text</code>, <code className="text-amber-400">lora</code>, <code className="text-amber-400">clip</code>），即刻定位節點中對應的欄位與值：
                        </p>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                          <input
                            type="text"
                            placeholder="搜尋欄位名稱或數值..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-8 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-colors"
                          />
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Search Results List */}
                      {searchQuery.trim() ? (
                        <div className="space-y-2.5">
                          <div className="text-[11px] text-gray-400 flex items-center justify-between">
                            <span>搜尋結果: {searchResults.length} 項匹配</span>
                          </div>

                          {searchResults.length === 0 ? (
                            <div className="p-6 bg-gray-900/40 rounded-xl border border-gray-800 text-center text-xs text-gray-500">
                              找不到匹配「{searchQuery}」的欄位或數值
                            </div>
                          ) : (
                            searchResults.map((res, idx) => (
                              <div key={idx} className="p-3 bg-gray-900/70 border border-gray-800/80 rounded-xl space-y-1">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-mono text-amber-400 font-semibold flex items-center gap-1">
                                    <Layers size={11} /> {res.nodeTitle || res.nodeClass} (ID: {res.nodeId})
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 font-mono text-[9px]">
                                    {res.nodeClass}
                                  </span>
                                </div>
                                <div className="text-xs flex items-baseline gap-2 pt-1">
                                  <span className="font-mono text-gray-400 text-[11px] shrink-0 font-medium">{res.key}:</span>
                                  <span className="font-mono text-gray-200 text-[11px] break-all select-text">
                                    {typeof res.value === 'object' ? JSON.stringify(res.value) : String(res.value)}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      ) : (
                        <div className="p-6 bg-gray-900/30 rounded-xl border border-gray-800/50 text-center text-xs text-gray-500 space-y-2">
                          <Search size={24} className="mx-auto opacity-30 text-amber-400" />
                          <p>在上方輸入關鍵字開始查詢 ComfyUI Workflow 中的特定欄位</p>
                        </div>
                      )}
                    </div>
                )}

                {/* TAB 3: RAW DATA */}
                {activeTab === 'raw' && (
                    <div className="relative group">
                         <button 
                            onClick={() => copyText(file.metadata || '', setCopiedRaw)}
                            className="absolute top-2 right-2 p-1.5 bg-gray-800 hover:bg-gray-700 rounded-md text-gray-400 hover:text-white transition-colors z-10"
                            title="Copy Raw JSON"
                        >
                            {copiedRaw ? <Check size={14} className="text-green-500"/> : <Copy size={14} />}
                        </button>
                        <pre className="font-mono text-[10px] leading-4 text-gray-400 whitespace-pre-wrap bg-black/40 p-4 rounded-xl border border-gray-800 overflow-x-auto select-text">
                            {file.metadata || 'No metadata available.'}
                        </pre>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-gray-800 bg-gray-900/30 flex items-center gap-2">
                <button 
                    onClick={handleDelete}
                    className="p-2.5 rounded-xl border border-red-900/30 bg-red-500/5 text-red-500 hover:bg-red-500 hover:text-white transition-all text-xs font-medium"
                    title="Delete File"
                >
                    <Trash2 size={14} />
                </button>

                <button
                    onClick={handleCopyFormattedPrompt}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700 hover:text-white transition-all text-xs font-medium"
                    title="複製 Prompt 與生成參數"
                >
                    {copiedAll ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                    <span>{copiedAll ? '已複製' : '複製 Prompt 與參數'}</span>
                </button>

                <a 
                    href={file.previewUrl} 
                    download={file.fileName}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-blue-600/40 bg-blue-600/20 text-blue-300 hover:bg-blue-600 hover:text-white transition-all text-xs font-medium"
                >
                    <Download size={14} /> 下載原圖/影片
                </a>
            </div>
        </div>
      </div>
    </div>
  );
};

