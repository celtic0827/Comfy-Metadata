import * as React from 'react';
import { useState, useMemo } from 'react';
import { ComfyFile } from '../types';
import { extractGenerationParams, extractCustomFieldValues, getLongestTextBlock, getLastTextBlock } from '../utils/comfyParser';
import { 
  X, 
  Download, 
  Copy, 
  Check, 
  FileText, 
  FileCode, 
  FileSpreadsheet, 
  Braces, 
  Filter, 
  Sliders, 
  Eye, 
  Sparkles,
  Search,
  Type
} from 'lucide-react';

export type ExportFormat = 'markdown' | 'text' | 'csv' | 'json';
export type PromptStrategy = 'longest' | 'standard' | 'last';

export interface ExportFieldsConfig {
  fileName: boolean;
  fileType: boolean;
  positivePrompt: boolean;
  negativePrompt: boolean;
  checkpoint: boolean;
  loras: boolean;
  parameters: boolean;
  dimensions: boolean;
  createdAt: boolean;
  customFieldKey: string;
}

interface PromptExportModalProps {
  files: ComfyFile[];
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const PromptExportModal: React.FC<PromptExportModalProps> = ({
  files,
  onClose,
  onToast
}) => {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [promptStrategy, setPromptStrategy] = useState<PromptStrategy>('longest');
  const [keywordFilter, setKeywordFilter] = useState('');
  const [copied, setCopied] = useState(false);
  const [previewTab, setPreviewTab] = useState<'preview' | 'settings'>('preview');

  // Fields selection state
  const [fields, setFields] = useState<ExportFieldsConfig>({
    fileName: true,
    fileType: true,
    positivePrompt: true,
    negativePrompt: true,
    checkpoint: true,
    loras: true,
    parameters: true,
    dimensions: true,
    createdAt: true,
    customFieldKey: '',
  });

  const toggleField = (key: keyof Omit<ExportFieldsConfig, 'customFieldKey'>) => {
    setFields(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Ensure files have resolved params
  const enrichedFiles = useMemo(() => {
    return files.map(file => {
      const params = file.params || (file.metadata ? extractGenerationParams(file.metadata) : undefined);
      return { ...file, params };
    });
  }, [files]);

  // Filter files by keyword if provided
  const filteredFiles = useMemo(() => {
    if (!keywordFilter.trim()) return enrichedFiles;
    const q = keywordFilter.trim().toLowerCase();

    return enrichedFiles.filter(f => {
      const posMatch = (f.positivePrompt || '').toLowerCase().includes(q);
      const negMatch = (f.negativePrompt || '').toLowerCase().includes(q);
      const nameMatch = f.fileName.toLowerCase().includes(q);
      const ckptMatch = (f.params?.checkpoint || '').toLowerCase().includes(q);
      const rawMatch = (f.metadata || '').toLowerCase().includes(q);
      return posMatch || negMatch || nameMatch || ckptMatch || rawMatch;
    });
  }, [enrichedFiles, keywordFilter]);

  const getFilePrompt = (file: ComfyFile): string => {
    if (promptStrategy === 'longest') {
      const longest = getLongestTextBlock(file.metadata);
      return longest || file.positivePrompt || '';
    }
    if (promptStrategy === 'last') {
      const last = getLastTextBlock(file.metadata);
      return last || file.positivePrompt || '';
    }
    return file.positivePrompt || '';
  };

  // Generate Document Content
  const generatedContent = useMemo(() => {
    const customKey = fields.customFieldKey.trim();

    if (format === 'markdown') {
      let md = `# ComfyUI Prompts & Parameters Export\n\n`;
      md += `> **Total Items**: ${filteredFiles.length} | **Export Date**: ${new Date().toLocaleString()}\n`;
      md += `> **Prompt Rule**: ${promptStrategy === 'longest' ? '字數最長文字區塊' : promptStrategy === 'last' ? '最後一欄' : '標準正向/負向'}\n`;
      if (keywordFilter.trim()) {
        md += `> **Keyword Filter**: "${keywordFilter.trim()}"\n`;
      }
      md += `\n---\n\n`;

      filteredFiles.forEach((file, index) => {
        md += `## ${index + 1}. ${fields.fileName ? file.fileName : `Asset #${index + 1}`}\n\n`;

        const metaBadges: string[] = [];
        if (fields.fileType) metaBadges.push(`**Type**: \`${file.type.toUpperCase()}\``);
        if (fields.createdAt) metaBadges.push(`**Date**: ${new Date(file.createdAt).toLocaleString()}`);
        if (fields.checkpoint && file.params?.checkpoint) metaBadges.push(`**Model**: \`${file.params.checkpoint}\``);
        if (fields.dimensions && (file.params?.width || file.params?.height)) {
          metaBadges.push(`**Resolution**: \`${file.params.width || '?'}x${file.params.height || '?'}\``);
        }

        if (metaBadges.length > 0) {
          md += `${metaBadges.join(' | ')}\n\n`;
        }

        // Custom field lookup
        if (customKey && file.metadata) {
          const customVals = extractCustomFieldValues(file.metadata, customKey);
          if (customVals.length > 0) {
            md += `### 🔍 Custom Field: \`${customKey}\`\n`;
            customVals.forEach(v => {
              const valStr = typeof v.value === 'object' ? JSON.stringify(v.value) : String(v.value);
              md += `- **[${v.nodeClass}] ${v.key}**: \`${valStr}\`\n`;
            });
            md += `\n`;
          }
        }

        // Positive / Main Prompt
        if (fields.positivePrompt) {
          const promptText = getFilePrompt(file);
          md += `### Prompt (${promptStrategy === 'longest' ? '字數最長' : 'Positive'})\n\n`;
          if (promptText) {
            md += `\`\`\`text\n${promptText}\n\`\`\`\n\n`;
          } else {
            md += `*None*\n\n`;
          }
        }

        // Negative Prompt
        if (fields.negativePrompt) {
          md += `### Negative Prompt\n\n`;
          if (file.negativePrompt) {
            md += `\`\`\`text\n${file.negativePrompt}\n\`\`\`\n\n`;
          } else {
            md += `*None*\n\n`;
          }
        }

        // LoRAs
        if (fields.loras && file.params?.loras && file.params.loras.length > 0) {
          md += `### LoRAs\n\n`;
          file.params.loras.forEach(lora => {
            md += `- ${lora}\n`;
          });
          md += `\n`;
        }

        // Generation Parameters
        if (fields.parameters && file.params) {
          const p = file.params;
          const hasParams = p.seed !== undefined || p.steps || p.cfg || p.sampler || p.scheduler || p.denoise !== undefined;
          if (hasParams) {
            md += `### Generation Parameters\n\n`;
            md += `| Parameter | Value |\n| :--- | :--- |\n`;
            if (p.seed !== undefined) md += `| **Seed** | \`${p.seed}\` |\n`;
            if (p.steps !== undefined) md += `| **Steps** | \`${p.steps}\` |\n`;
            if (p.cfg !== undefined) md += `| **CFG** | \`${p.cfg}\` |\n`;
            if (p.sampler) md += `| **Sampler** | \`${p.sampler}\` |\n`;
            if (p.scheduler) md += `| **Scheduler** | \`${p.scheduler}\` |\n`;
            if (p.denoise !== undefined) md += `| **Denoise** | \`${p.denoise}\` |\n`;
            md += `\n`;
          }
        }

        md += `---\n\n`;
      });

      return md;
    }

    if (format === 'text') {
      let txt = `================================================================================\n`;
      txt += `COMFYUI PROMPTS & PARAMETERS EXPORT\n`;
      txt += `Total Items: ${filteredFiles.length} | Date: ${new Date().toLocaleString()}\n`;
      if (keywordFilter.trim()) txt += `Filter: "${keywordFilter.trim()}"\n`;
      txt += `================================================================================\n\n`;

      filteredFiles.forEach((file, index) => {
        txt += `[#${index + 1}] ${fields.fileName ? file.fileName : `Asset #${index + 1}`}\n`;
        if (fields.fileType) txt += `Type: ${file.type.toUpperCase()}\n`;
        if (fields.createdAt) txt += `Date: ${new Date(file.createdAt).toLocaleString()}\n`;
        if (fields.checkpoint && file.params?.checkpoint) txt += `Model: ${file.params.checkpoint}\n`;
        if (fields.dimensions && (file.params?.width || file.params?.height)) {
          txt += `Dimensions: ${file.params.width || '?'}x${file.params.height || '?'}\n`;
        }

        if (customKey && file.metadata) {
          const customVals = extractCustomFieldValues(file.metadata, customKey);
          if (customVals.length > 0) {
            txt += `Custom Field [${customKey}]:\n`;
            customVals.forEach(v => {
              txt += `  - ${v.key}: ${typeof v.value === 'object' ? JSON.stringify(v.value) : v.value}\n`;
            });
          }
        }

        if (fields.parameters && file.params) {
          const p = file.params;
          const parts: string[] = [];
          if (p.seed !== undefined) parts.push(`Seed: ${p.seed}`);
          if (p.steps !== undefined) parts.push(`Steps: ${p.steps}`);
          if (p.cfg !== undefined) parts.push(`CFG: ${p.cfg}`);
          if (p.sampler) parts.push(`Sampler: ${p.sampler}`);
          if (p.scheduler) parts.push(`Scheduler: ${p.scheduler}`);
          if (p.denoise !== undefined) parts.push(`Denoise: ${p.denoise}`);
          if (parts.length > 0) txt += `Params: ${parts.join(', ')}\n`;
        }

        if (fields.loras && file.params?.loras && file.params.loras.length > 0) {
          txt += `LoRAs: ${file.params.loras.join(', ')}\n`;
        }

        if (fields.positivePrompt) {
          const promptText = getFilePrompt(file);
          txt += `\n--- Prompt (${promptStrategy === 'longest' ? '字數最長' : 'Positive'}) ---\n${promptText || '(None)'}\n`;
        }

        if (fields.negativePrompt) {
          txt += `\n--- Negative Prompt ---\n${file.negativePrompt || '(None)'}\n`;
        }

        txt += `\n--------------------------------------------------------------------------------\n\n`;
      });

      return txt;
    }

    if (format === 'csv') {
      const escapeCsv = (val: any): string => {
        if (val === undefined || val === null) return '""';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return `"${str.replace(/"/g, '""')}"`;
      };

      const headers: string[] = [];
      if (fields.fileName) headers.push('File Name');
      if (fields.fileType) headers.push('Type');
      if (fields.positivePrompt) headers.push(promptStrategy === 'longest' ? 'Prompt (Longest)' : 'Positive Prompt');
      if (fields.negativePrompt) headers.push('Negative Prompt');
      if (fields.checkpoint) headers.push('Model Checkpoint');
      if (fields.loras) headers.push('LoRAs');
      if (fields.parameters) {
        headers.push('Seed', 'Steps', 'CFG', 'Sampler', 'Scheduler', 'Denoise');
      }
      if (fields.dimensions) headers.push('Resolution');
      if (customKey) headers.push(`Custom Field (${customKey})`);
      if (fields.createdAt) headers.push('Created At');

      const rows: string[] = [headers.join(',')];

      filteredFiles.forEach(file => {
        const row: string[] = [];
        if (fields.fileName) row.push(escapeCsv(file.fileName));
        if (fields.fileType) row.push(escapeCsv(file.type));
        if (fields.positivePrompt) row.push(escapeCsv(getFilePrompt(file)));
        if (fields.negativePrompt) row.push(escapeCsv(file.negativePrompt || ''));
        if (fields.checkpoint) row.push(escapeCsv(file.params?.checkpoint || ''));
        if (fields.loras) row.push(escapeCsv((file.params?.loras || []).join('; ')));
        if (fields.parameters) {
          row.push(
            escapeCsv(file.params?.seed ?? ''),
            escapeCsv(file.params?.steps ?? ''),
            escapeCsv(file.params?.cfg ?? ''),
            escapeCsv(file.params?.sampler ?? ''),
            escapeCsv(file.params?.scheduler ?? ''),
            escapeCsv(file.params?.denoise ?? '')
          );
        }
        if (fields.dimensions) {
          const res = file.params?.width ? `${file.params.width}x${file.params.height || '?'}` : '';
          row.push(escapeCsv(res));
        }
        if (customKey) {
          const customVals = file.metadata ? extractCustomFieldValues(file.metadata, customKey) : [];
          const customStr = customVals.map(v => `${v.key}: ${typeof v.value === 'object' ? JSON.stringify(v.value) : v.value}`).join(' | ');
          row.push(escapeCsv(customStr));
        }
        if (fields.createdAt) row.push(escapeCsv(new Date(file.createdAt).toISOString()));

        rows.push(row.join(','));
      });

      // UTF-8 BOM for clean Excel opening
      return '\uFEFF' + rows.join('\r\n');
    }

    if (format === 'json') {
      const data = filteredFiles.map(file => {
        const item: Record<string, any> = {};
        if (fields.fileName) item.fileName = file.fileName;
        if (fields.fileType) item.type = file.type;
        if (fields.positivePrompt) item.prompt = getFilePrompt(file);
        if (fields.negativePrompt) item.negativePrompt = file.negativePrompt || '';
        if (fields.checkpoint) item.checkpoint = file.params?.checkpoint || '';
        if (fields.loras) item.loras = file.params?.loras || [];
        if (fields.parameters && file.params) {
          item.parameters = {
            seed: file.params.seed,
            steps: file.params.steps,
            cfg: file.params.cfg,
            sampler: file.params.sampler,
            scheduler: file.params.scheduler,
            denoise: file.params.denoise,
          };
        }
        if (fields.dimensions) {
          item.dimensions = {
            width: file.params?.width,
            height: file.params?.height,
          };
        }
        if (customKey && file.metadata) {
          item.customFieldQuery = {
            query: customKey,
            matches: extractCustomFieldValues(file.metadata, customKey)
          };
        }
        if (fields.createdAt) item.createdAt = new Date(file.createdAt).toISOString();
        return item;
      });

      return JSON.stringify(data, null, 2);
    }

    return '';
  }, [filteredFiles, format, fields, keywordFilter]);

  // Handle Download
  const handleDownload = () => {
    const extensions: Record<ExportFormat, string> = {
      markdown: 'md',
      text: 'txt',
      csv: 'csv',
      json: 'json',
    };
    const mimeTypes: Record<ExportFormat, string> = {
      markdown: 'text/markdown;charset=utf-8',
      text: 'text/plain;charset=utf-8',
      csv: 'text/csv;charset=utf-8',
      json: 'application/json;charset=utf-8',
    };

    const ext = extensions[format];
    const mime = mimeTypes[format];
    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `comfy_prompts_export_${timestamp}.${ext}`;

    const blob = new Blob([generatedContent], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    onToast(`Exported ${filteredFiles.length} prompts to ${filename}`);
  };

  // Handle Copy to clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    onToast(`Copied document content to clipboard!`);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 z-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-5xl h-[90vh] flex flex-col bg-[#0a0a0c] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800/80 bg-gradient-to-r from-gray-900/60 to-gray-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                匯出 Prompt 彙總文件 (Export Prompts)
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  {filteredFiles.length} 項檔案
                </span>
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                自訂欄位擷取、關鍵字搜尋，將多張圖片/影片的 Prompt 整理為單一下載文件
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Format Selector Bar */}
        <div className="px-6 py-3 border-b border-gray-800/60 bg-gray-900/30 flex flex-wrap items-center justify-between gap-4">
          
          {/* Format Tabs */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400 mr-1">匯出格式:</span>
            
            <button
              onClick={() => setFormat('markdown')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                format === 'markdown'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <FileCode size={14} /> Markdown (.md)
            </button>

            <button
              onClick={() => setFormat('text')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                format === 'text'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <FileText size={14} /> 純文字 (.txt)
            </button>

            <button
              onClick={() => setFormat('csv')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                format === 'csv'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <FileSpreadsheet size={14} /> Excel / CSV (.csv)
            </button>

            <button
              onClick={() => setFormat('json')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                format === 'json'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-gray-800/80 text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Braces size={14} /> JSON (.json)
            </button>
          </div>

          {/* Keyword Search Filter within Export */}
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="relative w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="過濾關鍵字 (Prompt/模型/名稱)..."
                value={keywordFilter}
                onChange={e => setKeywordFilter(e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-8 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {keywordFilter && (
                <button
                  onClick={() => setKeywordFilter('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Column: Field Extraction Settings */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-800/80 bg-[#0d0e12] flex flex-col overflow-y-auto custom-scrollbar p-5 space-y-6">
            
            {/* Prompt Extraction Strategy */}
            <div className="p-3.5 bg-gray-900/70 border border-blue-500/20 rounded-xl space-y-2.5">
              <span className="text-xs font-bold text-gray-200 uppercase tracking-wider flex items-center gap-1.5">
                <Type size={13} className="text-blue-400" />
                Prompt 擷取策略
              </span>
              <div className="space-y-2">
                <label className="flex items-start gap-2.5 p-2 rounded-lg bg-gray-950/60 hover:bg-gray-800/60 cursor-pointer border border-blue-500/30 text-xs transition-colors">
                  <input
                    type="radio"
                    name="promptStrategy"
                    value="longest"
                    checked={promptStrategy === 'longest'}
                    onChange={() => setPromptStrategy('longest')}
                    className="mt-0.5 text-blue-600 focus:ring-0 bg-gray-800 border-gray-700"
                  />
                  <div>
                    <span className="font-semibold text-blue-300 block">直接取「字數最長」區塊</span>
                    <span className="text-[10px] text-gray-400 block mt-0.5">推薦！自動判定最長文字為 Prompt，適用各類影片與自訂節點</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 rounded-lg bg-gray-950/40 hover:bg-gray-800/60 cursor-pointer border border-gray-800/60 text-xs transition-colors">
                  <input
                    type="radio"
                    name="promptStrategy"
                    value="standard"
                    checked={promptStrategy === 'standard'}
                    onChange={() => setPromptStrategy('standard')}
                    className="mt-0.5 text-blue-600 focus:ring-0 bg-gray-800 border-gray-700"
                  />
                  <div>
                    <span className="font-medium text-gray-300 block">標準正向 / 負向提示詞</span>
                    <span className="text-[10px] text-gray-500 block mt-0.5">依據 KSampler 正負向節點連線追蹤</span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 rounded-lg bg-gray-950/40 hover:bg-gray-800/60 cursor-pointer border border-gray-800/60 text-xs transition-colors">
                  <input
                    type="radio"
                    name="promptStrategy"
                    value="last"
                    checked={promptStrategy === 'last'}
                    onChange={() => setPromptStrategy('last')}
                    className="mt-0.5 text-blue-600 focus:ring-0 bg-gray-800 border-gray-700"
                  />
                  <div>
                    <span className="font-medium text-gray-300 block">取工作流「最後一欄」文字</span>
                    <span className="text-[10px] text-gray-500 block mt-0.5">擷取工作流最後一個輸入或元件文字</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Field Checkboxes */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders size={13} className="text-blue-400" /> 擷取欄位選擇
                </span>
                <span className="text-[11px] text-gray-500">
                  {Object.values(fields).filter(v => v === true).length} 欄已選
                </span>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-900/40 hover:bg-gray-900/80 cursor-pointer border border-gray-800/60 transition-colors text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={fields.positivePrompt}
                    onChange={() => toggleField('positivePrompt')}
                    className="rounded border-gray-700 text-blue-600 focus:ring-0 bg-gray-800"
                  />
                  <span className="font-medium text-green-400">正向提示詞 (Positive Prompt)</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-900/40 hover:bg-gray-900/80 cursor-pointer border border-gray-800/60 transition-colors text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={fields.negativePrompt}
                    onChange={() => toggleField('negativePrompt')}
                    className="rounded border-gray-700 text-blue-600 focus:ring-0 bg-gray-800"
                  />
                  <span className="font-medium text-red-400">負向提示詞 (Negative Prompt)</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-900/40 hover:bg-gray-900/80 cursor-pointer border border-gray-800/60 transition-colors text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={fields.checkpoint}
                    onChange={() => toggleField('checkpoint')}
                    className="rounded border-gray-700 text-blue-600 focus:ring-0 bg-gray-800"
                  />
                  <span>模型底模 (Checkpoint / Model)</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-900/40 hover:bg-gray-900/80 cursor-pointer border border-gray-800/60 transition-colors text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={fields.loras}
                    onChange={() => toggleField('loras')}
                    className="rounded border-gray-700 text-blue-600 focus:ring-0 bg-gray-800"
                  />
                  <span>LoRA 模型與權重</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-900/40 hover:bg-gray-900/80 cursor-pointer border border-gray-800/60 transition-colors text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={fields.parameters}
                    onChange={() => toggleField('parameters')}
                    className="rounded border-gray-700 text-blue-600 focus:ring-0 bg-gray-800"
                  />
                  <span>生成參數 (Seed, Steps, CFG, Sampler)</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-900/40 hover:bg-gray-900/80 cursor-pointer border border-gray-800/60 transition-colors text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={fields.dimensions}
                    onChange={() => toggleField('dimensions')}
                    className="rounded border-gray-700 text-blue-600 focus:ring-0 bg-gray-800"
                  />
                  <span>解析度尺寸 (Width x Height)</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-900/40 hover:bg-gray-900/80 cursor-pointer border border-gray-800/60 transition-colors text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={fields.fileName}
                    onChange={() => toggleField('fileName')}
                    className="rounded border-gray-700 text-blue-600 focus:ring-0 bg-gray-800"
                  />
                  <span>檔案名稱與檔案類型</span>
                </label>

                <label className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-900/40 hover:bg-gray-900/80 cursor-pointer border border-gray-800/60 transition-colors text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={fields.createdAt}
                    onChange={() => toggleField('createdAt')}
                    className="rounded border-gray-700 text-blue-600 focus:ring-0 bg-gray-800"
                  />
                  <span>建立日期與時間戳記</span>
                </label>
              </div>
            </div>

            {/* Custom Field Query (關鍵字找出特定欄位) */}
            <div className="pt-2 border-t border-gray-800">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Search size={13} className="text-amber-400" />
                擷取特定自訂欄位 (Custom Key)
              </label>
              <p className="text-[11px] text-gray-500 mb-2">
                輸入節點欄位名稱或關鍵字（例如：<code className="text-blue-400">denoise</code>, <code className="text-blue-400">clip_skip</code>, <code className="text-blue-400">t5xxl</code>, <code className="text-blue-400">vae_name</code>, <code className="text-blue-400">batch_size</code>），將自動自 metadata 擷取：
              </p>
              <div className="relative">
                <input
                  type="text"
                  placeholder="例如: denoise 或 clip_skip"
                  value={fields.customFieldKey}
                  onChange={e => setFields(prev => ({ ...prev, customFieldKey: e.target.value }))}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-amber-300 font-mono placeholder-gray-600 focus:outline-none focus:border-amber-500 transition-colors"
                />
                {fields.customFieldKey && (
                  <button
                    onClick={() => setFields(prev => ({ ...prev, customFieldKey: '' }))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Document Statistics */}
            <div className="p-3 bg-gray-900/60 border border-gray-800/60 rounded-xl space-y-1.5 text-xs">
              <div className="text-gray-400 flex justify-between">
                <span>包含檔案數:</span>
                <span className="font-mono text-white font-semibold">{filteredFiles.length} / {files.length}</span>
              </div>
              <div className="text-gray-400 flex justify-between">
                <span>預估字符數:</span>
                <span className="font-mono text-gray-300">{generatedContent.length.toLocaleString()} 字元</span>
              </div>
              <div className="text-gray-400 flex justify-between">
                <span>格式類型:</span>
                <span className="font-mono text-blue-400 uppercase font-semibold">{format}</span>
              </div>
            </div>
          </div>

          {/* Right Column: Live Document Preview */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#070709] relative">
            
            <div className="px-5 py-3 border-b border-gray-800/60 bg-gray-950/40 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 flex items-center gap-1.5">
                <Eye size={14} className="text-blue-400" />
                文件即時預覽 (Live Document Preview)
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-medium transition-all"
                  title="複製全文"
                >
                  {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
                  <span>{copied ? '已複製全文' : '複製全文'}</span>
                </button>
              </div>
            </div>

            {/* Code / Text Preview */}
            <div className="flex-1 overflow-auto custom-scrollbar p-5">
              {filteredFiles.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs">
                  <Filter size={32} className="opacity-20 mb-2" />
                  <p>沒有符合目前過濾條件的檔案</p>
                </div>
              ) : (
                <pre className="font-mono text-xs leading-relaxed text-gray-300 whitespace-pre-wrap select-text bg-black/40 p-4 rounded-xl border border-gray-800/80">
                  {generatedContent}
                </pre>
              )}
            </div>

            {/* Bottom Footer Actions */}
            <div className="p-4 border-t border-gray-800 bg-gray-950/80 backdrop-blur flex items-center justify-between gap-4">
              <div className="text-xs text-gray-400 truncate hidden sm:block">
                已準備就緒，點擊下載即可儲存為單一文件。
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={onClose}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-gray-700 text-gray-300 hover:bg-gray-800 text-xs font-medium transition-colors"
                >
                  關閉
                </button>
                <button
                  onClick={handleDownload}
                  disabled={filteredFiles.length === 0}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download size={15} />
                  下載文件 (.{format === 'markdown' ? 'md' : format})
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
