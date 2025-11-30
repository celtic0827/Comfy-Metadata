
import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Project, ComfyFile } from '../types';

interface ComfyDB extends DBSchema {
  projects: {
    key: string;
    value: Project;
  };
  files: {
    key: string;
    value: Omit<ComfyFile, 'previewUrl'>; // We don't store previewUrl
    indexes: { 'by-project': string };
  };
}

const DB_NAME = 'comfy-metadata-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ComfyDB>>;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<ComfyDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Project Store
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        // File Store
        if (!db.objectStoreNames.contains('files')) {
          const fileStore = db.createObjectStore('files', { keyPath: 'id' });
          fileStore.createIndex('by-project', 'projectId');
        }
      },
    });
  }
  return dbPromise;
};

// --- Projects ---

export const getProjects = async (): Promise<Project[]> => {
  const db = await initDB();
  return db.getAll('projects');
};

export const saveProject = async (project: Project): Promise<void> => {
  const db = await initDB();
  await db.put('projects', project);
};

export const deleteProject = async (id: string): Promise<void> => {
  const db = await initDB();
  await db.delete('projects', id);
};

// --- Files ---

export const getFilesByProject = async (projectId: string): Promise<ComfyFile[]> => {
  const db = await initDB();
  const files = await db.getAllFromIndex('files', 'by-project', projectId);
  // Return as ComfyFile (previewUrl will be undefined, handled by UI)
  return files as ComfyFile[];
};

export const countFilesByProject = async (projectId: string): Promise<number> => {
  const db = await initDB();
  return db.countFromIndex('files', 'by-project', projectId);
};

export const saveFile = async (file: ComfyFile): Promise<void> => {
  const db = await initDB();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { previewUrl, ...fileToSave } = file; // Don't save the object URL
  await db.put('files', fileToSave);
};

export const deleteFile = async (id: string): Promise<void> => {
  const db = await initDB();
  await db.delete('files', id);
};

export const deleteFilesByProject = async (projectId: string): Promise<void> => {
  const db = await initDB();
  const tx = db.transaction('files', 'readwrite');
  const index = tx.store.index('by-project');
  
  // Iterate and delete
  let cursor = await index.openCursor(projectId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
};
