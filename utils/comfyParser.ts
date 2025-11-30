
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
  // Sometimes data is { "prompt": { ...nodes... }, "workflow": { ... } } which confuses the parser
  if (!data.nodes && !Array.isArray(data)) {
      if (data.prompt && typeof data.prompt === 'object' && !Array.isArray(data.prompt)) {
          // It's likely an API format wrapper
          data = data.prompt;
      } else if (data.workflow && typeof data.workflow === 'object') {
           // It's likely a UI format wrapper
           if (data.workflow.nodes) {
               data = data.workflow;
           } else {
               // rarely workflow itself is the nodes object in API format? Unlikely but check
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
    'text_positive', 'text_negative', 'text_a', 'text_b', 'positive', 'negative'
  ];

  // 2. Helper to get input value or trace link
  const resolveInput = (node: any, inputName: string, visited = new Set<string>()): string | null => {
    if (!node) return null;
    
    // Inputs can be in 'inputs' (API) or 'widgets_values' (UI)
    let val = node.inputs ? node.inputs[inputName] : undefined;
    
    // If not found in inputs, check widgets_values if available (UI format usually)
    // widgets_values is an array, tricky to map by name without extra logic, 
    // but sometimes text is just the first widget.
    
    if (val === undefined && !isApiFormat && node.widgets_values) {
        // Naive check: if inputName implies text, look for strings in widgets
        if (typeof node.widgets_values === 'object') { // sometimes array, sometimes map depending on version
             const arr = Array.isArray(node.widgets_values) ? node.widgets_values : Object.values(node.widgets_values);
             const strVal = arr.find((v: any) => typeof v === 'string' && v.length > 2);
             if (strVal) return strVal;
        }
    }

    if (visited.has(node.id || '')) return null; // Cycle detection

    // Case A: Direct String value
    if (typeof val === 'string') return val;

    // Case B: Link [NodeID, SlotIndex] (API Format)
    if (Array.isArray(val) && val.length === 2 && isApiFormat) {
      const sourceId = val[0];
      const sourceNode = nodesMap[sourceId];
      if (!sourceNode) return null;

      const type = (sourceNode.class_type || '').toLowerCase();
      
      // 2a. Found Text Node (Standard or Custom)
      if (
          type.includes('text') || 
          type.includes('prompt') || 
          type.includes('string') ||
          type.includes('styles') // Styles nodes
      ) {
        // Try all known text keys
        for (const key of TEXT_INPUT_KEYS) {
            if (sourceNode.inputs && sourceNode.inputs[key] && typeof sourceNode.inputs[key] === 'string') {
                return sourceNode.inputs[key];
            }
        }
        
        // If no known key matches, grab the first string property in inputs
        if (sourceNode.inputs) {
            for (const v of Object.values(sourceNode.inputs)) {
                if (typeof v === 'string' && v.length > 2) return v as string;
            }
        }
      }
      
      // 2b. Pass-through nodes (Reroute, Primitive, Combiners)
      if (type.includes('reroute') || type.includes('primitive') || type.includes('node') || type.includes('pipe')) {
        // Try finding any input that is a link and recurse
        for (const key of Object.keys(sourceNode.inputs || {})) {
           const res = resolveInput(sourceNode, key, new Set([...visited, sourceId]));
           if (res) return res;
        }
      }
      
      // 2c. Conditioning Combine
      if (type.includes('combine') || type.includes('average')) {
         const p1 = resolveInput(sourceNode, 'conditioning_1', new Set([...visited, sourceId])) || 
                    resolveInput(sourceNode, 'conditioning_to', new Set([...visited, sourceId]));
         const p2 = resolveInput(sourceNode, 'conditioning_2', new Set([...visited, sourceId])) || 
                    resolveInput(sourceNode, 'conditioning_from', new Set([...visited, sourceId]));
         
         if (p1 && p2) return p1 + "\n\n" + p2;
         return p1 || p2;
      }
    }

    return null;
  };

  // 3. Find Samplers and Trace
  // We look for nodes that look like samplers (KSampler, SamplerCustom, etc.)
  if (isApiFormat) {
     const samplers = Object.values(nodesMap).filter((node: any) => {
       const type = (node.class_type || '').toLowerCase();
       return type.includes('sampler') && !type.includes('save') && !type.includes('image'); 
     });

     for (const sampler of samplers) {
        const pos = resolveInput(sampler, 'positive');
        if (pos && !result.positive) result.positive = cleanText(pos);

        const neg = resolveInput(sampler, 'negative');
        if (neg && !result.negative) result.negative = cleanText(neg);

        if (result.positive && result.negative) break; 
     }
  }

  // 4. Fallback / Collect All strings (Generic Summary)
  // This extracts ANY strings found in the graph if we missed the specific positive/negative connections
  Object.values(nodesMap).forEach((node: any) => {
    // Check inputs
    const inputs = node.inputs;
    if (inputs) {
        Object.values(inputs).forEach((val: any) => {
            if (typeof val === 'string' && val.length > 3 && !val.includes('.safetensors') && !val.includes('.pt')) {
                 result.all.push(val);
            }
        });
    }

    // Check widgets_values (Important for UI format JSONs)
    const widgets = node.widgets_values;
    if (widgets) {
         if (Array.isArray(widgets)) {
             widgets.forEach(val => {
                if (typeof val === 'string' && val.length > 3 && !val.includes('.safetensors')) {
                    result.all.push(val);
                }
             });
         }
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
           const cleanText = textPart.replace(/^[\x00-\x1F]+/, ''); // Clean header garbage
           foundText.push(cleanText);
        }
      }
    }
    offset += 12 + length; 
  }

  // ComfyUI uses "prompt" for the API execution graph, and "workflow" for the UI graph.
  // We prefer "prompt" because it has explicit links.
  let rawJson = foundText.find(t => {
      try {
          const j = JSON.parse(t);
          // API format usually is a dictionary of nodes key'd by ID
          return !j.nodes && !Array.isArray(j); 
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
  // If the file is smaller than 50MB, read the whole thing to be safe.
  // If larger, read the first 15MB and last 15MB.
  
  const FILE_LIMIT_FOR_FULL_SCAN = 50 * 1024 * 1024; // 50MB
  const SCAN_CHUNK_SIZE = 15 * 1024 * 1024; // 15MB
  
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
  
  // Search patterns for Comfy Metadata in MP4
  // Added "workflow", "client_id", "extra_pnginfo" to capture more variations
  const candidateStarts = [];
  const regex = /\{"nodes":|{"extra_data":|{"version":|{"prompt":|{"workflow":|{"client_id":|{"extra_pnginfo":/g;
  let match;
  
  while ((match = regex.exec(fullTextScan)) !== null) {
      candidateStarts.push(match.index);
  }

  for (const startIdx of candidateStarts) {
      let openBraces = 0;
      let endIdx = -1;
      let foundStart = false;
      
      // Limit scan length to avoid freezing on massive strings
      // We assume valid metadata won't be larger than 5MB
      const scanLimit = Math.min(fullTextScan.length, startIdx + 5 * 1024 * 1024); 

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
              // Basic validation to check if it looks like Comfy data
              if (
                  parsed.nodes || 
                  parsed.extra_data || 
                  parsed.prompt || 
                  parsed.workflow ||
                  parsed.extra_pnginfo ||
                  (parsed[0] && parsed[0].inputs)
              ) {
                 const { positive, negative, all } = extractPrompts(parsed);
                 return {
                     raw: jsonStr,
                     summary: all,
                     positivePrompt: positive,
                     negativePrompt: negative
                 };
              }
          } catch (e) {
              // invalid json, continue searching
          }
      }
  }

  throw new Error('Could not find recognizable ComfyUI metadata in MP4.');
};
