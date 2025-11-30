
import { ParsedMetadata } from '../types';

/**
 * Clean up text prompts by removing artifacts or raw JSON chars if badly parsed
 */
const cleanText = (text: string): string => {
  if (!text) return '';
  return text.trim();
};

/**
 * Graph Traversal Logic
 */
const extractPrompts = (data: any): { positive: string, negative: string, all: string[] } => {
  const result = { positive: '', negative: '', all: [] as string[] };
  
  // 0. Unwrap Wrapper if necessary
  // sometimes data is { "prompt": { ... }, "workflow": { ... } }
  if (!data.nodes && !Array.isArray(data)) {
      if (data.prompt && typeof data.prompt === 'object' && !Array.isArray(data.prompt)) {
          data = data.prompt;
      } else if (data.workflow && typeof data.workflow === 'object') {
           if (data.workflow.nodes) {
               data = data.workflow;
           } else {
               data = data.workflow;
           }
      }
  }

  // Normalize nodes into a map for easy ID lookup
  let nodesMap: Record<string, any> = {};
  let isApiFormat = false;

  // 1. Determine Format & Build Map
  if (data.nodes && Array.isArray(data.nodes)) {
    // UI Workflow Format
    data.nodes.forEach((node: any) => {
      nodesMap[node.id] = node;
    });
  } else if (typeof data === 'object') {
    // API Prompt Format (Execution Graph)
    isApiFormat = true;
    nodesMap = data;
  }

  // Known keys used by various custom nodes for text input
  const TEXT_INPUT_KEYS = [
    'text', 'text_g', 'text_l', 'string', 'prompt', 'value', 'input_text', 'string_field', 
    'text_positive', 'text_negative', 'text_a', 'text_b', 'positive', 'negative',
    'caption', 'tag', 'tags', 'description', 'message', 't5xxl', 'clip_l'
  ];

  // 2. Helper to get input value or trace link
  const resolveInput = (node: any, inputName: string, visited = new Set<string>()): string | null => {
    if (!node) return null;
    if (visited.has(node.id || '')) return null; // Cycle detection

    // Inputs can be in 'inputs' (API) or 'widgets_values' (UI)
    let val = node.inputs ? node.inputs[inputName] : undefined;
    
    // UI Format Fallback: Check widgets_values
    if (val === undefined && !isApiFormat && node.widgets_values) {
        // In UI format, widgets are arrays. Identifying "the text widget" is tricky.
        // Heuristic: Find the first long string.
        if (Array.isArray(node.widgets_values)) {
             const strVal = node.widgets_values.find((v: any) => typeof v === 'string' && v.length > 5);
             if (strVal) return strVal;
        }
    }

    // Case A: Direct String value
    if (typeof val === 'string') return val;

    // Case B: Link [NodeID, SlotIndex] (API Format)
    if (Array.isArray(val) && val.length === 2 && isApiFormat) {
      const sourceId = val[0];
      const sourceNode = nodesMap[sourceId];
      if (!sourceNode) return null;

      // Aggressively check for text inputs in the source node FIRST
      for (const key of TEXT_INPUT_KEYS) {
        const inputVal = sourceNode.inputs ? sourceNode.inputs[key] : undefined;
        if (typeof inputVal === 'string' && inputVal.length > 1) {
             return inputVal;
        }
      }

      const type = (sourceNode.class_type || '').toLowerCase();
      
      // Pass-through nodes
      if (type.includes('reroute') || type.includes('primitive') || type.includes('node') || type.includes('pipe') || type.includes('bus')) {
        for (const key of Object.keys(sourceNode.inputs || {})) {
           const res = resolveInput(sourceNode, key, new Set([...visited, sourceId]));
           if (res) return res;
        }
      }
      
      // Combiners
      if (type.includes('combine') || type.includes('concat') || type.includes('average')) {
         const p1 = resolveInput(sourceNode, 'conditioning_1', new Set([...visited, sourceId])) || 
                    resolveInput(sourceNode, 'text_a', new Set([...visited, sourceId])) ||
                    resolveInput(sourceNode, 'string_a', new Set([...visited, sourceId]));

         const p2 = resolveInput(sourceNode, 'conditioning_2', new Set([...visited, sourceId])) || 
                    resolveInput(sourceNode, 'text_b', new Set([...visited, sourceId])) ||
                    resolveInput(sourceNode, 'string_b', new Set([...visited, sourceId]));
         
         if (p1 && p2) return p1 + "\n\n" + p2;
         return p1 || p2;
      }
    }

    return null;
  };

  // 3. Find Samplers and Trace
  if (isApiFormat) {
     // Look for KSampler, SamplerCustom, etc.
     const samplers = Object.values(nodesMap).filter((node: any) => {
       const type = (node.class_type || '').toLowerCase();
       // Exclude Save/Load nodes, only want processing nodes
       return (type.includes('sampler') || type.includes('generate')) && !type.includes('save') && !type.includes('load'); 
     });

     for (const sampler of samplers) {
        // Try common input names for positive/negative conditioning
        const pos = resolveInput(sampler, 'positive') || resolveInput(sampler, 'conditioning');
        if (pos && !result.positive) result.positive = cleanText(pos);

        const neg = resolveInput(sampler, 'negative');
        if (neg && !result.negative) result.negative = cleanText(neg);

        if (result.positive && result.negative) break; 
     }
  }

  // 4. Fallback / Collect All strings (Generic Summary)
  Object.values(nodesMap).forEach((node: any) => {
    // Inputs
    const inputs = node.inputs;
    if (inputs) {
        Object.values(inputs).forEach((val: any) => {
            if (typeof val === 'string' && val.length > 3 && !val.includes('.safetensors') && !val.includes('.pt') && !val.includes('.ckpt')) {
                 result.all.push(val);
            }
        });
    }
    // Widgets (UI Format)
    const widgets = node.widgets_values;
    if (widgets && Array.isArray(widgets)) {
         widgets.forEach(val => {
            if (typeof val === 'string' && val.length > 3 && !val.includes('.safetensors')) {
                result.all.push(val);
            }
         });
    }
  });

  result.all = [...new Set(result.all)];

  return result;
};


export const parseComfyMetadata = async (file: File): Promise<ParsedMetadata> => {
  if (file.type.startsWith('image/png') || file.name.endsWith('.png')) {
    return parsePNG(file);
  } else if (file.type.startsWith('video/mp4') || file.name.endsWith('.mp4')) {
    return parseMP4(file);
  } else {
    throw new Error('Unsupported file type. Please use PNG or MP4.');
  }
};

const parsePNG = async (file: File): Promise<ParsedMetadata> => {
  const buffer = await file.arrayBuffer();
  const dataView = new DataView(buffer);
  const decoder = new TextDecoder('utf-8');
  
  if (dataView.getUint32(0) !== 0x89504e47) {
    throw new Error('Invalid PNG signature');
  }

  let offset = 8;
  const foundText: string[] = [];

  while (offset < buffer.byteLength) {
    const length = dataView.getUint32(offset);
    const type = decoder.decode(buffer.slice(offset + 4, offset + 8));
    
    if (type === 'tEXt' || type === 'iTXt') {
      const chunkData = new Uint8Array(buffer, offset + 8, length);
      let nullByteIndex = -1;
      for (let i = 0; i < length; i++) {
        if (chunkData[i] === 0) {
          nullByteIndex = i;
          break;
        }
      }

      if (nullByteIndex !== -1) {
        const keyword = decoder.decode(chunkData.slice(0, nullByteIndex));
        if (keyword === 'prompt' || keyword === 'workflow') {
           const textPart = decoder.decode(chunkData.slice(nullByteIndex + 1));
           const cleanText = textPart.replace(/^[\x00-\x1F]+/, ''); 
           foundText.push(cleanText);
        }
      }
    }
    offset += 12 + length; 
  }

  // Prefer "prompt" (API format) over "workflow" (UI format)
  let rawJson = foundText.find(t => {
      try {
          const j = JSON.parse(t);
          return !j.nodes && !Array.isArray(j); // heuristic for API format
      } catch { return false; }
  });

  if (!rawJson) {
      rawJson = foundText.find(t => t.trim().startsWith('{'));
  }
  
  if (!rawJson) {
    throw new Error('No ComfyUI metadata found in PNG chunks.');
  }

  let parsed: any;
  try {
     parsed = JSON.parse(rawJson);
  } catch {
     return { raw: rawJson, summary: [] };
  }

  const { positive, negative, all } = extractPrompts(parsed);

  return {
    raw: rawJson,
    summary: all,
    positivePrompt: positive,
    negativePrompt: negative
  };
};

const parseMP4 = async (file: File): Promise<ParsedMetadata> => {
  // Strategy: Read larger chunks for video files.
  const FILE_LIMIT_FOR_FULL_SCAN = 100 * 1024 * 1024; // 100MB
  const SCAN_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB scan at start/end if too big
  
  let fullTextScan = '';
  const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

  if (file.size < FILE_LIMIT_FOR_FULL_SCAN) {
      const buffer = await file.arrayBuffer();
      fullTextScan = decoder.decode(buffer);
  } else {
      const bufferStart = await file.slice(0, SCAN_CHUNK_SIZE).arrayBuffer();
      const bufferEnd = await file.slice(Math.max(0, file.size - SCAN_CHUNK_SIZE), file.size).arrayBuffer();
      fullTextScan = decoder.decode(bufferStart) + decoder.decode(bufferEnd);
  }
  
  // Search patterns
  const regex = /\{"nodes":|{"extra_data":|{"version":|{"prompt":|{"workflow":|{"client_id":|{"extra_pnginfo":|{"id":|{"last_node_id":|{"groups":|{"config":|\{"\d+":/g;
  let match;
  
  let bestResult: ParsedMetadata | null = null;
  let fallbackResult: ParsedMetadata | null = null;

  // Collect all potential JSON starts
  const candidateStarts = [];
  while ((match = regex.exec(fullTextScan)) !== null) {
      candidateStarts.push(match.index);
  }

  for (const startIdx of candidateStarts) {
      let openBraces = 0;
      let endIdx = -1;
      let foundStart = false;
      
      const scanLimit = Math.min(fullTextScan.length, startIdx + 10 * 1024 * 1024); 

      for (let i = startIdx; i < scanLimit; i++) {
          if (fullTextScan[i] === '{') {
              openBraces++;
              foundStart = true;
          } else if (fullTextScan[i] === '}') {
              openBraces--;
          }

          if (foundStart && openBraces === 0) {
              endIdx = i;
              break;
          }
      }

      if (endIdx !== -1) {
          const jsonStr = fullTextScan.substring(startIdx, endIdx + 1);
          try {
              const parsed = JSON.parse(jsonStr);
              
              const isUI = !!parsed.nodes && Array.isArray(parsed.nodes);
              const isAPI = !isUI && typeof parsed === 'object' && Object.keys(parsed).some(k => !isNaN(Number(k)) && (parsed[k].inputs || parsed[k].class_type));
              const isWrapper = !!parsed.prompt || !!parsed.workflow || !!parsed.extra_pnginfo;

              if (isAPI || isUI || isWrapper) {
                 const extracted = extractPrompts(parsed);
                 
                 const result = {
                     raw: jsonStr,
                     summary: extracted.all,
                     positivePrompt: extracted.positive,
                     negativePrompt: extracted.negative
                 };

                 // Priority Logic:
                 // 1. API Format (has specific positive/negative structure extracted)
                 // 2. UI Format (usually has empty positive/negative but good for fallback)
                 
                 if (isAPI && (extracted.positive || extracted.negative)) {
                     // Gold standard found, return immediately
                     return result;
                 }
                 
                 if (isAPI && !bestResult) {
                     bestResult = result;
                 } else if (isUI && !fallbackResult) {
                     fallbackResult = result;
                 } else if (isWrapper && !fallbackResult) {
                     fallbackResult = result;
                 }
              }
          } catch (e) {
              // invalid json, continue
          }
      }
  }

  // Return best found
  if (bestResult) return bestResult;
  if (fallbackResult) return fallbackResult;

  throw new Error('Could not find recognizable ComfyUI metadata in MP4.');
};
