
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
  
  // Normalize nodes into a map for easy ID lookup
  // API Format: { "id": { ... } }
  // Workflow Format: { "nodes": [ ... ], "links": [ ... ] }
  
  let nodesMap: Record<string, any> = {};
  let isApiFormat = false;

  // 1. Determine Format & Build Map
  if (data.nodes && Array.isArray(data.nodes)) {
    // UI Workflow Format
    data.nodes.forEach((node: any) => {
      nodesMap[node.id] = node;
    });
    // For workflow format, we need links to trace. 
    // We'll create a reverse lookup: linkID -> { origin_id, origin_slot, ... }
    // But simplistic approach: finding text directly in this format is harder without executing.
    // However, usually PNGs contain the API format in the "prompt" keyword.
  } else if (typeof data === 'object') {
    // API Prompt Format (Execution Graph)
    isApiFormat = true;
    nodesMap = data;
  }

  // 2. Helper to get input value or trace link
  const resolveInput = (node: any, inputName: string, visited = new Set<string>()): string | null => {
    if (!node || !node.inputs) return null;
    if (visited.has(node.id || '')) return null; // Cycle detection
    // visited.add(node.id || ''); // Add if tracking cycles strictly

    const val = node.inputs[inputName];

    // Case A: Direct String value
    if (typeof val === 'string') return val;

    // Case B: Link [NodeID, SlotIndex] (API Format)
    if (Array.isArray(val) && val.length === 2 && isApiFormat) {
      const sourceId = val[0];
      const sourceNode = nodesMap[sourceId];
      if (!sourceNode) return null;

      // Recurse based on source node type
      const type = (sourceNode.class_type || '').toLowerCase();
      
      // Found Text Node
      if (type.includes('cliptextencode') || type.includes('prompt')) {
        return sourceNode.inputs.text || sourceNode.inputs.text_g || sourceNode.inputs.text_l;
      }
      
      // Found Combiner / Reroute (Pass-through)
      // e.g. ConditioningCombine, Reroute
      if (type.includes('reroute') || type.includes('primitive')) {
        // Reroute usually just passes the first input or "input"
        // Primitives usually have a value or input
        // This is heuristic.
        // Try finding any input that is a link
        for (const key of Object.keys(sourceNode.inputs)) {
           const res = resolveInput(sourceNode, key, new Set([...visited, sourceId]));
           if (res) return res;
        }
      }
      
      // Found Conditioning Combine (usually combines 2 prompts)
      if (type.includes('combine')) {
         // Try to get both and join
         const p1 = resolveInput(sourceNode, 'conditioning_1', new Set([...visited, sourceId]));
         const p2 = resolveInput(sourceNode, 'conditioning_2', new Set([...visited, sourceId]));
         if (p1 && p2) return p1 + "\n\n" + p2;
         return p1 || p2;
      }
    }

    return null;
  };

  // 3. Find Samplers and Trace
  if (isApiFormat) {
     const samplers = Object.values(nodesMap).filter((node: any) => {
       const type = (node.class_type || '').toLowerCase();
       return type.includes('sampler') && !type.includes('save'); // simple heuristic
     });

     // Identify KSampler, KSamplerAdvanced, etc.
     for (const sampler of samplers) {
        // Try to find positive
        const pos = resolveInput(sampler, 'positive');
        if (pos && !result.positive) result.positive = cleanText(pos);

        // Try to find negative
        const neg = resolveInput(sampler, 'negative');
        if (neg && !result.negative) result.negative = cleanText(neg);

        if (result.positive && result.negative) break; // Found both
     }
  }

  // 4. Fallback / Collect All strings (Generic Summary)
  // This ensures we show something even if the graph traversal failed or format wasn't standard API
  Object.values(nodesMap).forEach((node: any) => {
    const inputs = node.inputs || node.widgets_values; // widgets_values for workflow format
    if (!inputs) return;

    const checkAndAdd = (val: any) => {
      if (typeof val === 'string' && val.length > 5 && !val.includes('.safetensors')) {
        // Exclude common non-prompt strings if needed
        result.all.push(val);
      }
    };

    if (Array.isArray(inputs)) {
      inputs.forEach(checkAndAdd);
    } else if (typeof inputs === 'object') {
      Object.values(inputs).forEach(checkAndAdd);
    }
  });

  // Remove duplicates from 'all'
  result.all = [...new Set(result.all)];

  return result;
};


export const parseComfyMetadata = async (file: File): Promise<ParsedMetadata> => {
  if (file.type.startsWith('image/png')) {
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
           // Basic naive decode, skipping parsing iTXt headers for simplicity as Comfy is standard
           const textPart = decoder.decode(chunkData.slice(nullByteIndex + 1));
           // Remove potential iTXt compression flags/headers residue if any
           const cleanText = textPart.replace(/^[\x00-\x1F]+/, '');
           foundText.push(cleanText);
        }
      }
    }
    offset += 12 + length; 
  }

  // Prefer "prompt" chunk (API format) as it's easier to trace connections
  // But store "workflow" (UI) if prompt is missing
  let rawJson = foundText.find(t => {
      try {
          const j = JSON.parse(t);
          // API format usually doesn't have "nodes" array at root, it's keyed by ID
          // But Comfy sometimes puts API format in "prompt" key.
          return !j.nodes && !Array.isArray(j); 
      } catch { return false; }
  });

  if (!rawJson) {
      // Fallback to workflow format if API format not found
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
  const CHUNK_SIZE = 100 * 1024; // 100KB
  const bufferStart = await file.slice(0, Math.min(file.size, CHUNK_SIZE)).arrayBuffer();
  const bufferEnd = await file.slice(Math.max(0, file.size - CHUNK_SIZE), file.size).arrayBuffer();
  
  const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
  const textStart = decoder.decode(bufferStart);
  const textEnd = decoder.decode(bufferEnd);
  
  const fullTextScan = textStart + textEnd;

  // Look for JSON object
  const match = fullTextScan.match(/\{"nodes":\[.*\]|"extra_data":\{.*\}|\{"\d+":\{"inputs":/);
  
  if (match) {
    const startIdx = match.index!;
    let openBraces = 0;
    let endIdx = -1;
    let foundStart = false;

    const scanArea = fullTextScan.slice(startIdx);
    for (let i = 0; i < scanArea.length; i++) {
      if (scanArea[i] === '{') {
        openBraces++;
        foundStart = true;
      } else if (scanArea[i] === '}') {
        openBraces--;
      }
      if (foundStart && openBraces === 0) {
        endIdx = i;
        break;
      }
    }

    if (endIdx !== -1) {
      const jsonStr = scanArea.substring(0, endIdx + 1);
      try {
        const parsed = JSON.parse(jsonStr);
        const { positive, negative, all } = extractPrompts(parsed);
        return {
            raw: jsonStr,
            summary: all,
            positivePrompt: positive,
            negativePrompt: negative
        };
      } catch (e) {
        // fail silent
      }
    }
  }

  throw new Error('Could not find recognizable ComfyUI metadata in MP4.');
};
