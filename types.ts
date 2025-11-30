
export interface Project {
  id: string;
  parentId?: string | null; // For nested folders/projects
  name: string;
  createdAt: number;
  isOpen?: boolean; // For expanding/collapsing folders in UI
}

export interface ComfyFile {
  id: string;
  projectId: string; // Link to a project
  fileName: string;
  fileType: string;
  blob: Blob; // Stored in IndexedDB
  previewUrl?: string; // Generated runtime (URL.createObjectURL), not stored
  type: 'image' | 'video' | 'unknown';
  status: 'pending' | 'processing' | 'success' | 'error';
  metadata: string | null; // The raw JSON prompt or workflow
  summary?: string[]; // Legacy fallback or generic text
  positivePrompt?: string; // Extracted positive prompt
  negativePrompt?: string; // Extracted negative prompt
  errorMessage?: string;
  createdAt: number;
}

export interface ParsedMetadata {
  raw: string;
  summary?: string[];
  positivePrompt?: string;
  negativePrompt?: string;
}
