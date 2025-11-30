import * as React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DropZone } from './components/DropZone';
import { MetadataCard } from './components/MetadataCard';
import { ProjectSidebar } from './components/ProjectSidebar';
import { ComfyFile, Project } from './types';
import { parseComfyMetadata } from './utils/comfyParser';
import * as db from './utils/db';
import { Trash2, Sparkles, Menu, LayoutGrid, List as ListIcon, Image as ImageIcon, Video as VideoIcon, Upload, Search, Command, Folder, ScanLine } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [files, setFiles] = useState<ComfyFile[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // View Mode State
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  
  // Drag State for Main Area
  const [isDraggingMain, setIsDraggingMain] = useState(false);
  const dragCounter = useRef(0);
  
  // Scroll Refs
  const listContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // --- Initialization ---
  useEffect(() => {
    const init = async () => {
      try {
        await db.initDB();
        const storedProjects = await db.getProjects();
        
        if (storedProjects.length > 0) {
          setProjects(storedProjects);
          setActiveProjectId(storedProjects[0].id);
        } else {
          const defaultProject: Project = { 
            id: uuidv4(), 
            name: 'Default Project', 
            parentId: null, 
            createdAt: Date.now(), 
            isOpen: true 
          };
          await db.saveProject(defaultProject);
          setProjects([defaultProject]);
          setActiveProjectId(defaultProject.id);
        }
      } catch (e) {
        console.error("Database initialization failed", e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // --- Load Files when Project Changes ---
  useEffect(() => {
    let isActive = true;
    const loadFiles = async () => {
      if (!activeProjectId) {
        setFiles([]);
        return;
      }
      
      try {
        const storedFiles = await db.getFilesByProject(activeProjectId);
        
        if (isActive) {
          const hydratedFiles = storedFiles.map(f => ({
            ...f,
            previewUrl: URL.createObjectURL(f.blob)
          }));
          setFiles(hydratedFiles.sort((a, b) => b.createdAt - a.createdAt));
        }
      } catch (e) {
        console.error("Failed to load files", e);
      }
    };

    const cleanup = () => {
      setFiles(prev => {
        prev.forEach(f => {
          if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
        });
        return [];
      });
    };
    
    cleanup();
    loadFiles();

    return () => {
      isActive = false;
      cleanup();
    };
  }, [activeProjectId]);


  // --- Project Actions ---

  const handleCreateProject = async (name: string, parentId: string | null = null) => {
    const newProject: Project = {
      id: uuidv4(),
      parentId,
      name,
      createdAt: Date.now(),
      isOpen: true
    };
    
    await db.saveProject(newProject);

    setProjects(prev => {
        if (parentId) {
            return [...prev.map(p => p.id === parentId ? { ...p, isOpen: true } : p), newProject];
        }
        return [...prev, newProject];
    });
    
    if (parentId) {
      const parent = projects.find(p => p.id === parentId);
      if (parent) await db.saveProject({ ...parent, isOpen: true });
    }
    
    setActiveProjectId(newProject.id);
  };

  const handleRenameProject = async (id: string, newName: string) => {
    const project = projects.find(p => p.id === id);
    if (!project) return;
    
    const updated = { ...project, name: newName };
    await db.saveProject(updated);
    setProjects(prev => prev.map(p => p.id === id ? updated : p));
  };

  const handleToggleProject = async (id: string) => {
      const project = projects.find(p => p.id === id);
      if (project) {
        const updated = { ...project, isOpen: !project.isOpen };
        await db.saveProject(updated);
        setProjects(prev => prev.map(p => p.id === id ? updated : p));
      }
  };

  const handleMoveProject = async (projectId: string, newParentId: string | null) => {
    if (projectId === newParentId) return;

    // Cycle detection: Ensure newParentId is not a descendant of projectId
    let current = projects.find(p => p.id === newParentId);
    while (current) {
        if (current.id === projectId) {
            alert("Cannot move a folder into its own sub-folder.");
            return;
        }
        if (!current.parentId) break;
        current = projects.find(p => p.id === current.parentId);
    }

    const project = projects.find(p => p.id === projectId);
    if (project) {
        const updated = { ...project, parentId: newParentId };
        await db.saveProject(updated);
        setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
        
        // Ensure new parent is expanded
        if (newParentId) {
            const parent = projects.find(p => p.id === newParentId);
            if (parent && !parent.isOpen) {
                const updatedParent = { ...parent, isOpen: true };
                await db.saveProject(updatedParent);
                setProjects(prev => prev.map(p => p.id === newParentId ? updatedParent : p));
            }
        }
    }
  };

  const handleDeleteProject = async (id: string) => {
    const getDescendantIds = (rootId: string, allProjects: Project[]): string[] => {
        const children = allProjects.filter(p => p.parentId === rootId);
        let ids = children.map(c => c.id);
        children.forEach(child => {
            ids = [...ids, ...getDescendantIds(child.id, allProjects)];
        });
        return ids;
    };

    const idsToDelete = [id, ...getDescendantIds(id, projects)];
    
    // Check for contents (files and subfolders)
    const subfolderCount = idsToDelete.length - 1;
    let totalFileCount = 0;
    
    for (const pid of idsToDelete) {
      totalFileCount += await db.countFilesByProject(pid);
    }

    const hasContents = subfolderCount > 0 || totalFileCount > 0;

    if (hasContents) {
      const confirmMessage = `This folder contains:\n` +
        (subfolderCount > 0 ? `- ${subfolderCount} sub-folders\n` : '') +
        (totalFileCount > 0 ? `- ${totalFileCount} files\n` : '') +
        `\nAre you sure you want to delete it? This action cannot be undone.`;
        
      if (!confirm(confirmMessage)) return;
    } else {
      if (!confirm("Delete this empty folder?")) return;
    }

    // Proceed with deletion
    for (const projectId of idsToDelete) {
      await db.deleteFilesByProject(projectId);
      await db.deleteProject(projectId);
    }

    setProjects(prev => prev.filter(p => !idsToDelete.includes(p.id)));
    
    if (idsToDelete.includes(activeProjectId)) {
      const remaining = projects.filter(p => !idsToDelete.includes(p.id));
      if (remaining.length > 0) {
        setActiveProjectId(remaining[0].id);
      } else {
        const newDefault = { id: uuidv4(), name: 'My Project', parentId: null, createdAt: Date.now(), isOpen: true };
        await db.saveProject(newDefault);
        setProjects([newDefault]);
        setActiveProjectId(newDefault.id);
      }
    }
  };

  // --- File Actions ---

  const processFiles = useCallback(async (newFiles: File[]) => {
    if (!activeProjectId) return;

    const tempEntries: ComfyFile[] = newFiles.map(file => ({
      id: uuidv4(),
      projectId: activeProjectId,
      fileName: file.name,
      fileType: file.type,
      blob: file, 
      previewUrl: URL.createObjectURL(file),
      type: file.type.startsWith('video') || file.name.endsWith('.mp4') ? 'video' : 'image',
      status: 'processing',
      metadata: null,
      createdAt: Date.now()
    }));

    setFiles(prev => [...tempEntries, ...prev]);

    for (const entry of tempEntries) {
      try {
        const result = await parseComfyMetadata(entry.blob as File);
        
        let formattedRaw = result.raw;
        try {
           const jsonObj = JSON.parse(result.raw);
           formattedRaw = JSON.stringify(jsonObj, null, 2);
        } catch (e) { /* ignore */ }

        const updatedFile: ComfyFile = {
           ...entry,
           status: 'success',
           metadata: formattedRaw,
           summary: result.summary,
           positivePrompt: result.positivePrompt,
           negativePrompt: result.negativePrompt
        };

        await db.saveFile(updatedFile);
        setFiles(prev => prev.map(f => f.id === entry.id ? updatedFile : f));

      } catch (error: any) {
        const errorFile: ComfyFile = {
           ...entry,
           status: 'error',
           errorMessage: error.message || 'Unknown error'
        };
        await db.saveFile(errorFile);
        setFiles(prev => prev.map(f => f.id === entry.id ? errorFile : f));
      }
    }
  }, [activeProjectId]);

  const handleDeleteFile = async (fileId: string) => {
    await db.deleteFile(fileId);
    setFiles(prev => {
      const file = prev.find(f => f.id === fileId);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      return prev.filter(f => f.id !== fileId);
    });
    // Remove ref
    if (itemRefs.current[fileId]) {
      delete itemRefs.current[fileId];
    }
  };

  const handleClearProjectFiles = async () => {
    if (!activeProjectId) return;
    if (!confirm('Are you sure you want to delete all files in this project? This cannot be undone.')) return;

    await db.deleteFilesByProject(activeProjectId);
    
    setFiles(prev => {
      prev.forEach(f => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      return [];
    });
    itemRefs.current = {};
  };

  // --- View Logic ---

  const handleThumbnailClick = (id: string) => {
    setViewMode('list');
    setTimeout(() => {
      const element = itemRefs.current[id];
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2', 'ring-offset-gray-950');
        setTimeout(() => {
           element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2', 'ring-offset-gray-950');
        }, 1500);
      }
    }, 50);
  };

  // --- Main Drag & Drop Logic ---
  const onMainDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
        setIsDraggingMain(true);
    }
  };

  const onMainDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
        setIsDraggingMain(false);
    }
  };

  const onMainDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onMainDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingMain(false);
    dragCounter.current = 0;
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter((file: File) => 
      file.type.startsWith('image/png') || 
      file.type.startsWith('video/mp4') ||
      file.name.endsWith('.png') || 
      file.name.endsWith('.mp4')
    );
    
    if (droppedFiles.length > 0) {
      processFiles(droppedFiles);
    }
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

  if (loading) {
    return (
      <div className="h-[100dvh] bg-gray-950 flex items-center justify-center text-gray-500 font-mono">
        <div className="flex flex-col items-center gap-4">
           <div className="w-8 h-8 border-2 border-blue-500/50 border-t-blue-500 rounded-full animate-spin"></div>
           <p className="text-xs uppercase tracking-widest">Initializing Environment</p>
        </div>
      </div>
    );
  }

  // --- Sidebar Content Component (Shared between Mobile/Desktop) ---
  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
        {/* App Branding / Header */}
        <div className="p-4 border-b border-gray-800 shrink-0">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span className="bg-gradient-to-br from-amber-500 to-orange-600 w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-lg shadow-orange-900/20">
                    <ScanLine size={16} />
                </span>
                <span className="bg-gradient-to-r from-gray-100 to-gray-400 bg-clip-text text-transparent">
                    Comfy Metadata
                </span>
            </h1>
            <p className="text-gray-500 text-[10px] mt-3 font-mono flex items-center gap-2 uppercase tracking-wider">
                <Command size={10} /> {files.length} Assets
            </p>
            <div className="flex items-center gap-2 text-[10px] text-green-500/80 mt-1.5 font-mono">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.4)]"></div>
                IndexedDB Active
            </div>
        </div>

        {/* Upload Area */}
        <div className="p-4 border-b border-gray-800 shrink-0">
             <DropZone 
                onFilesDropped={processFiles} 
                className="h-32 text-sm"
             />
        </div>

        {/* Explorer */}
        <div className="flex-1 overflow-hidden min-h-0">
            <ProjectSidebar 
                projects={projects}
                activeProjectId={activeProjectId}
                onSelectProject={(id) => {
                  setActiveProjectId(id);
                  if (window.innerWidth < 768) setIsSidebarOpen(false);
                }}
                onCreateProject={handleCreateProject}
                onDeleteProject={handleDeleteProject}
                onRenameProject={handleRenameProject}
                onToggleProject={handleToggleProject}
                onMoveProject={handleMoveProject}
            />
        </div>
     </div>
  );

  return (
    <div className="flex h-[100dvh] bg-[#050505] text-gray-200 font-sans overflow-hidden selection:bg-blue-500/20">
      
      {/* Mobile Menu Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Mobile Sidebar Drawer */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out md:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebarContent}
      </div>

      {/* Desktop Sidebar (Left Column) */}
      <div className="hidden md:block w-72 border-r border-gray-800 shrink-0 z-20">
        {sidebarContent}
      </div>

      {/* Main Content (Right Column) */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#050505] relative">
          
        {/* Mobile Header (Visible on Mobile Only) */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-30">
            <div className="flex items-center gap-3">
                <button onClick={() => setIsSidebarOpen(true)} className="p-1 -ml-1 text-gray-400">
                    <Menu size={20} />
                </button>
                <span className="font-semibold text-white">Comfy Metadata</span>
            </div>
            <div className="text-xs text-gray-400">
                {activeProject?.name}
            </div>
        </div>

        {/* Content Scroll Area with Global D&D */}
        <div 
            className="flex-1 overflow-y-auto md:overflow-y-auto md:h-full custom-scrollbar relative"
            onDragEnter={onMainDragEnter}
            onDragOver={onMainDragOver}
            onDragLeave={onMainDragLeave}
            onDrop={onMainDrop}
        >
            {/* Global Drag Overlay */}
            {isDraggingMain && (
                <div className="absolute inset-0 z-50 bg-blue-500/10 backdrop-blur-sm border-4 border-dashed border-blue-500/50 m-4 rounded-xl flex items-center justify-center pointer-events-none">
                    <div className="bg-gray-900/90 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border border-blue-500/30">
                        <Upload size={48} className="text-blue-400 animate-bounce" />
                        <h3 className="text-xl font-bold text-white">Drop Files Here</h3>
                        <p className="text-blue-300/80">Add to {activeProject?.name}</p>
                    </div>
                </div>
            )}
            
            {/* Mobile Upload Button Area */}
            <div className="md:hidden p-4 pb-0">
                <input 
                    type="file" 
                    id="mobile-upload-input" 
                    multiple 
                    accept=".png,.mp4" 
                    className="hidden" 
                    onChange={(e) => {
                        if (e.target.files) {
                            processFiles(Array.from(e.target.files));
                            e.target.value = ''; 
                        }
                    }}
                />
                <button 
                    onClick={() => document.getElementById('mobile-upload-input')?.click()}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-xl font-medium shadow-lg shadow-blue-900/20 active:scale-95 transition-transform"
                >
                    <Upload size={18} />
                    <span>Add Media</span>
                </button>
            </div>

            {/* Toolbar (Sticky) */}
            <div className="sticky top-0 z-20 p-4 md:p-6 pb-2 md:pb-4 backdrop-blur-xl bg-[#050505]/80">
                <div className="flex items-center justify-between backdrop-blur-md bg-gray-900/40 p-1.5 rounded-xl border border-gray-800/60 shadow-sm">
                    <div className="flex items-center gap-3 pl-3">
                        <span className="text-gray-400">
                            <Folder size={16} />
                        </span>
                        <span className="text-sm font-medium text-gray-200">
                            {activeProject?.name}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="h-4 w-px bg-gray-700/50 mx-1"></div>
                        
                        <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/5">
                            <button 
                            onClick={() => setViewMode('grid')}
                            className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'grid' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            title="Grid View"
                            >
                            <LayoutGrid size={16} />
                            </button>
                            <button 
                            onClick={() => setViewMode('list')}
                            className={`p-1.5 rounded-[6px] transition-all ${viewMode === 'list' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                            title="List View"
                            >
                            <ListIcon size={16} />
                            </button>
                        </div>

                        {files.length > 0 && (
                            <button 
                            onClick={handleClearProjectFiles}
                            className="mr-1 p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Clear All Files"
                            >
                            <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* File List */}
            <div 
                ref={listContainerRef}
                className="px-4 md:px-6 pb-24 relative z-10"
            >
                {files.length === 0 && (
                    <div className="mt-8">
                        <DropZone 
                            onFilesDropped={processFiles} 
                            className="h-64 border-dashed border-gray-800 bg-gray-900/20 hover:bg-gray-900/40"
                        />
                        <p className="text-center text-gray-500 mt-4 text-xs uppercase tracking-wider">
                            Project is empty. Drop files to start.
                        </p>
                    </div>
                )}

                {/* Grid View */}
                {viewMode === 'grid' && files.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {files.map(file => (
                        <div 
                            key={file.id}
                            onClick={() => handleThumbnailClick(file.id)}
                            className="group relative aspect-square bg-[#0a0a0a] border border-gray-800 rounded-lg overflow-hidden cursor-pointer hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-900/10 transition-all duration-300"
                        >
                            {file.previewUrl ? (
                                file.type === 'video' ? (
                                <video src={file.previewUrl} className="w-full h-full object-cover pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity" muted />
                                ) : (
                                <img src={file.previewUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={file.fileName} />
                                )
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-800 bg-gray-925">
                                <Sparkles size={24} />
                                </div>
                            )}
                            
                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                <p className="text-[10px] text-gray-200 font-medium truncate font-mono mb-1">{file.fileName}</p>
                                <div className="flex justify-between items-center">
                                <div className="flex gap-1.5">
                                    {file.type === 'video' ? <VideoIcon size={12} className="text-purple-400" /> : <ImageIcon size={12} className="text-blue-400" />}
                                </div>
                                {file.status === 'success' ? (
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
                                ) : (
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                )}
                                </div>
                            </div>
                        </div>
                    ))}
                    </div>
                )}
                
                {/* List View */}
                {viewMode === 'list' && (
                    <div className="space-y-8">
                    {files.map(file => (
                        <div key={file.id} ref={(el) => { itemRefs.current[file.id] = el; }} className="scroll-mt-36 transition-all duration-500">
                        <MetadataCard item={file} onDelete={handleDeleteFile} />
                        </div>
                    ))}
                    </div>
                )}
            </div>

        </div>

      </div>
    </div>
  );
};

export default App;