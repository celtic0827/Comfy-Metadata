import { ParsedMetadata, GenerationParams, SearchMatchField } from '../types';

/**
 * Clean up text prompts by removing artifacts or raw JSON chars if badly parsed
 */
const cleanText = (text: string): string => {
  if (!text) return '';
  return text.trim();
};

/**
 * Normalizes ComfyUI graph into a uniform nodesMap
 */
export const normalizeGraph = (raw: any): { nodesMap: Record<string, any>; isApiFormat: boolean } => {
  let data = raw;
  if (!data) return { nodesMap: {}, isApiFormat: false };
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return { nodesMap: {}, isApiFormat: false };
    }
  }

  // Unwrap wrappers if present
  if (!data.nodes && !Array.isArray(data)) {
    if (data.prompt && typeof data.prompt === 'object' && !Array.isArray(data.prompt)) {
      data = data.prompt;
    } else if (data.workflow && typeof data.workflow === 'object') {
      data = data.workflow;
    }
  }

  let nodesMap: Record<string, any> = {};
  let isApiFormat = false;

  if (data.nodes && Array.isArray(data.nodes)) {
    // UI Workflow Format
    data.nodes.forEach((node: any) => {
      if (node && node.id !== undefined) {
        nodesMap[String(node.id)] = node;
      }
    });
  } else if (typeof data === 'object' && !Array.isArray(data)) {
    // API Prompt Format (Execution Graph)
    isApiFormat = true;
    nodesMap = data;
  }

  return { nodesMap, isApiFormat };
};

/**
 * Extract generation parameters (Model/Checkpoint, LoRA, Seed, Steps, CFG, Sampler, Dimensions)
 */
export const extractGenerationParams = (dataOrJson: any): GenerationParams => {
  const { nodesMap, isApiFormat } = normalizeGraph(dataOrJson);
  const params: GenerationParams = {};
  const loras: string[] = [];

  const nodes = Object.values(nodesMap);

  for (const node of nodes) {
    if (!node) continue;
    const classType = String(node.class_type || node.type || '').toLowerCase();
    const inputs = node.inputs || {};
    const widgets = Array.isArray(node.widgets_values) ? node.widgets_values : [];

    // 1. Checkpoint / Model
    if (
      classType.includes('checkpoint') ||
      classType.includes('unetloader') ||
      classType.includes('modelloader') ||
      classType.includes('diffusionmodel') ||
      classType.includes('dualcliploader')
    ) {
      const ckpt = inputs.ckpt_name || inputs.unet_name || inputs.model_name;
      if (typeof ckpt === 'string' && ckpt.trim() && !params.checkpoint) {
        params.checkpoint = ckpt.trim();
      } else if (!params.checkpoint && widgets.length > 0) {
        const foundCkpt = widgets.find(
          (w: any) =>
            typeof w === 'string' &&
            (w.endsWith('.safetensors') || w.endsWith('.ckpt') || w.endsWith('.pt') || w.endsWith('.gguf'))
        );
        if (foundCkpt) params.checkpoint = String(foundCkpt);
      }
    }

    // 2. LoRA models
    if (classType.includes('lora')) {
      const loraName = inputs.lora_name;
      const strength = inputs.strength_model ?? inputs.strength;
      if (typeof loraName === 'string' && loraName.trim()) {
        const label = strength !== undefined ? `${loraName} (${strength})` : loraName;
        if (!loras.includes(label)) loras.push(label);
      } else if (widgets.length > 0) {
        const foundLora = widgets.find(
          (w: any) => typeof w === 'string' && (w.endsWith('.safetensors') || w.endsWith('.pt'))
        );
        if (foundLora && !loras.includes(String(foundLora))) {
          loras.push(String(foundLora));
        }
      }
    }

    // 3. Sampler & Generation parameters
    if (classType.includes('sampler') || classType.includes('generate')) {
      if (inputs.seed !== undefined && params.seed === undefined) params.seed = inputs.seed;
      if (inputs.noise_seed !== undefined && params.seed === undefined) params.seed = inputs.noise_seed;
      if (inputs.steps !== undefined && params.steps === undefined) params.steps = Number(inputs.steps);
      if (inputs.cfg !== undefined && params.cfg === undefined) params.cfg = Number(inputs.cfg);
      if (inputs.sampler_name !== undefined && params.sampler === undefined)
        params.sampler = String(inputs.sampler_name);
      if (inputs.scheduler !== undefined && params.scheduler === undefined)
        params.scheduler = String(inputs.scheduler);
      if (inputs.denoise !== undefined && params.denoise === undefined) params.denoise = Number(inputs.denoise);

      // In UI widgets format, values are often [seed, "randomize", steps, cfg, sampler_name, scheduler, denoise]
      if (!isApiFormat && widgets.length >= 3) {
        if (params.seed === undefined && typeof widgets[0] === 'number') params.seed = widgets[0];
        if (params.steps === undefined) {
          const stepVal = widgets.find(
            (w: any) => typeof w === 'number' && w >= 1 && w <= 200 && Number.isInteger(w)
          );
          if (stepVal !== undefined) params.steps = stepVal;
        }
        if (params.cfg === undefined) {
          const cfgVal = widgets.find(
            (w: any) => typeof w === 'number' && w >= 0.5 && w <= 30 && !Number.isInteger(w)
          );
          if (cfgVal !== undefined) params.cfg = cfgVal;
        }
        if (params.sampler === undefined) {
          const samplerNames = ['euler', 'euler_ancestral', 'heun', 'dpm', 'ddim', 'uni_pc', 'lms', 'ipndm'];
          const foundSampler = widgets.find(
            (w: any) => typeof w === 'string' && samplerNames.some((s) => w.toLowerCase().includes(s))
          );
          if (foundSampler) params.sampler = String(foundSampler);
        }
      }
    }

    // Also check seed generator nodes
    if (classType.includes('seed')) {
      if (inputs.seed !== undefined && params.seed === undefined) params.seed = inputs.seed;
      if (inputs.noise_seed !== undefined && params.seed === undefined) params.seed = inputs.noise_seed;
    }

    // 4. Latent dimensions (Width / Height)
    if (classType.includes('latent') || classType.includes('empty')) {
      if (inputs.width !== undefined && params.width === undefined) params.width = Number(inputs.width);
      if (inputs.height !== undefined && params.height === undefined) params.height = Number(inputs.height);
      if (!isApiFormat && widgets.length >= 2 && (!params.width || !params.height)) {
        const numbers = widgets.filter((w: any) => typeof w === 'number' && w >= 64 && w <= 8192);
        if (numbers.length >= 2) {
          params.width = numbers[0];
          params.height = numbers[1];
        }
      }
    }
  }

  if (loras.length > 0) {
    params.loras = loras;
  }

  return params;
};

/**
 * Search metadata across nodes, inputs, and widgets by keyword
 */
export const searchMetadataFields = (rawJson: string | null, query: string): SearchMatchField[] => {
  if (!rawJson || !query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const { nodesMap } = normalizeGraph(rawJson);
  const results: SearchMatchField[] = [];

  for (const [nodeId, node] of Object.entries(nodesMap)) {
    if (!node) continue;
    const nodeClass = String(node.class_type || node.type || 'Node');
    const nodeTitle = node._meta?.title || node.title || nodeClass;
    const titleMatch = nodeTitle.toLowerCase().includes(q) || nodeClass.toLowerCase().includes(q);

    // Search inputs
    const inputs = node.inputs || {};
    for (const [key, val] of Object.entries(inputs)) {
      if (val === undefined || val === null) continue;
      const keyStr = String(key);
      const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);

      const keyMatches = keyStr.toLowerCase().includes(q);
      const valMatches = valStr.toLowerCase().includes(q);

      if (keyMatches || valMatches || titleMatch) {
        results.push({
          nodeId,
          nodeTitle,
          nodeClass,
          key: keyStr,
          value: val,
          matchType: keyMatches && valMatches ? 'both' : keyMatches ? 'key' : 'value',
        });
      }
    }

    // Search widgets_values if UI format
    if (Array.isArray(node.widgets_values)) {
      node.widgets_values.forEach((w: any, idx: number) => {
        if (w === undefined || w === null) return;
        const valStr = typeof w === 'object' ? JSON.stringify(w) : String(w);
        if (valStr.toLowerCase().includes(q) || titleMatch) {
          results.push({
            nodeId,
            nodeTitle,
            nodeClass,
            key: `widget_${idx}`,
            value: w,
            matchType: 'value',
          });
        }
      });
    }
  }

  return results;
};

/**
 * Extract values of a specific field key across the entire graph
 */
export const extractCustomFieldValues = (rawJson: string | null, fieldKey: string): { key: string; value: any; nodeClass: string }[] => {
  if (!rawJson || !fieldKey || !fieldKey.trim()) return [];
  const target = fieldKey.trim().toLowerCase();
  const { nodesMap } = normalizeGraph(rawJson);
  const results: { key: string; value: any; nodeClass: string }[] = [];

  for (const node of Object.values(nodesMap)) {
    if (!node) continue;
    const nodeClass = String(node.class_type || node.type || 'Node');
    const inputs = node.inputs || {};

    for (const [k, v] of Object.entries(inputs)) {
      if (k.toLowerCase() === target || k.toLowerCase().includes(target)) {
        if (v !== undefined && v !== null) {
          // If it's a link [nodeId, slot], don't return raw link array as value unless that's all there is
          results.push({
            key: k,
            value: v,
            nodeClass,
          });
        }
      }
    }
  }

  return results;
};

/**
 * Graph Traversal Logic for Prompts
 */
const extractPrompts = (data: any): { positive: string; negative: string; all: string[] } => {
  const result = { positive: '', negative: '', all: [] as string[] };
  const { nodesMap, isApiFormat } = normalizeGraph(data);

  // Known keys used by various custom nodes for text input
  const TEXT_INPUT_KEYS = [
    'text', 'text_g', 'text_l', 'string', 'prompt', 'value', 'input_text', 'string_field', 
    'text_positive', 'text_negative', 'text_a', 'text_b', 'positive', 'negative',
    'caption', 'tag', 'tags', 'description', 'message', 't5xxl', 'clip_l'
  ];

  // Helper to get input value or trace link
  const resolveInput = (node: any, inputName: string, visited = new Set<string>()): string | null => {
    if (!node) return null;
    if (visited.has(String(node.id || ''))) return null; // Cycle detection

    // Inputs can be in 'inputs' (API) or 'widgets_values' (UI)
    let val = node.inputs ? node.inputs[inputName] : undefined;
    
    // UI Format Fallback: Check widgets_values
    if (val === undefined && !isApiFormat && node.widgets_values) {
        if (Array.isArray(node.widgets_values)) {
             const strVal = node.widgets_values.find((v: any) => typeof v === 'string' && v.length > 5);
             if (strVal) return strVal;
        }
    }

    // Case A: Direct String value
    if (typeof val === 'string') return val;

    // Case B: Link [NodeID, SlotIndex] (API Format)
    if (Array.isArray(val) && val.length === 2 && isApiFormat) {
      const sourceId = String(val[0]);
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

  // Find Samplers and Trace
  if (isApiFormat) {
     const samplers = Object.values(nodesMap).filter((node: any) => {
       const type = (node.class_type || '').toLowerCase();
       return (type.includes('sampler') || type.includes('generate')) && !type.includes('save') && !type.includes('load'); 
     });

     for (const sampler of samplers) {
        const pos = resolveInput(sampler, 'positive') || resolveInput(sampler, 'conditioning');
        if (pos && !result.positive) result.positive = cleanText(pos);

        const neg = resolveInput(sampler, 'negative');
        if (neg && !result.negative) result.negative = cleanText(neg);

        if (result.positive && result.negative) break; 
     }
  }

  // Fallback / Collect All strings (Generic Summary)
  Object.values(nodesMap).forEach((node: any) => {
    const inputs = node.inputs;
    if (inputs) {
        Object.values(inputs).forEach((val: any) => {
            if (typeof val === 'string' && val.length > 3 && !val.includes('.safetensors') && !val.includes('.pt') && !val.includes('.ckpt')) {
                 result.all.push(val);
            }
        });
    }
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

  // If positive prompt is not found through traditional KSampler positive conditioning,
  // apply the user-requested "Directly take the Longest Text Block" rule:
  if (!result.positive && result.all.length > 0) {
    const candidateTexts = result.all.filter(t => 
      !t.startsWith('## Model Links') &&
      !t.startsWith('| megapixels') &&
      !t.includes('https://huggingface.co')
    );
    const sorted = (candidateTexts.length > 0 ? candidateTexts : result.all)
      .slice()
      .sort((a, b) => b.length - a.length);

    if (sorted.length > 0 && sorted[0].length >= 10) {
      result.positive = cleanText(sorted[0]);
    }
  }

  return result;
};

/**
 * Extracts the longest text block from metadata
 */
export const getLongestTextBlock = (rawJson: string | null): string => {
  if (!rawJson) return '';
  const { nodesMap } = normalizeGraph(rawJson);
  const candidates: string[] = [];

  for (const node of Object.values(nodesMap)) {
    if (!node) continue;
    const inputs = node.inputs || {};
    for (const val of Object.values(inputs)) {
      if (typeof val === 'string' && val.length > 5 && !val.endsWith('.safetensors') && !val.endsWith('.pt') && !val.endsWith('.ckpt')) {
        candidates.push(val.trim());
      }
    }
    if (Array.isArray(node.widgets_values)) {
      for (const w of node.widgets_values) {
        if (typeof w === 'string' && w.length > 5 && !w.endsWith('.safetensors') && !w.endsWith('.pt')) {
          candidates.push(w.trim());
        }
      }
    }
  }

  const filtered = candidates.filter(t => 
    !t.startsWith('## Model Links') &&
    !t.startsWith('| megapixels') &&
    !t.includes('https://huggingface.co')
  );

  const sorted = (filtered.length > 0 ? filtered : candidates).sort((a, b) => b.length - a.length);
  return sorted[0] || '';
};

/**
 * Extracts the last text block from metadata
 */
export const getLastTextBlock = (rawJson: string | null): string => {
  if (!rawJson) return '';
  const { nodesMap } = normalizeGraph(rawJson);
  let lastStr = '';

  for (const node of Object.values(nodesMap)) {
    if (!node) continue;
    const inputs = node.inputs || {};
    for (const val of Object.values(inputs)) {
      if (typeof val === 'string' && val.length > 5 && !val.endsWith('.safetensors') && !val.endsWith('.pt') && !val.endsWith('.ckpt')) {
        lastStr = val.trim();
      }
    }
    if (Array.isArray(node.widgets_values)) {
      for (const w of node.widgets_values) {
        if (typeof w === 'string' && w.length > 5 && !w.endsWith('.safetensors') && !w.endsWith('.pt')) {
          lastStr = w.trim();
        }
      }
    }
  }

  return lastStr;
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
  const params = extractGenerationParams(parsed);

  return {
    raw: rawJson,
    summary: all,
    positivePrompt: positive,
    negativePrompt: negative,
    params
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
                 const params = extractGenerationParams(parsed);
                 
                 const result: ParsedMetadata = {
                     raw: jsonStr,
                     summary: extracted.all,
                     positivePrompt: extracted.positive,
                     negativePrompt: extracted.negative,
                     params
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
