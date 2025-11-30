
import * as React from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DropZone } from './components/DropZone';
import { ProjectSidebar } from './components/ProjectSidebar';
import { DetailModal } from './components/DetailModal';
import { GridItem } from './components/GridItem';
import { MoveModal } from './components/MoveModal'; 
import { ComfyFile, Project } from './types';
import { parseComfyMetadata } from './utils/comfyParser';
import * as db from './utils/db';
import { Trash2, Menu, Upload, ScanLine, Command, Folder, CheckSquare, FolderInput, X, Check } from 'lucide-react';
import JSZip from 'jszip';

const App: React.FC = () => {
  // --- State ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [files, setFiles] = useState<ComfyFile[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  
  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);

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
          // Reset selection on project change
          setIsSelectionMode(false);
          setSelectedIds(new Set());
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

    // Cycle detection
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
    
    const subfolderCount = idsToDelete.length - 1;
    let totalFileCount = 0;
    
    for (const pid of idsToDelete) {
      totalFileCount += await db.countFilesByProject(pid);
    }

    const hasContents = subfolderCount > 0 || totalFileCount > 0;

    if (hasContents) {
      const confirmMessage = `This folder contains contents. Delete?`;
      if (!confirm(confirmMessage)) return;
    } else {
      if (!confirm("Delete this empty folder?")) return;
    }

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

  const handleExportProject = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    try {
        const projectFiles = await db.getFilesByProject(projectId);
        
        if (projectFiles.length === 0) {
            alert("This folder is empty.");
            return;
        }

        const zip = new JSZip();
        
        // Add files to zip
        projectFiles.forEach(file => {
            zip.file(file.fileName, file.blob);
        });

        // Generate zip
        const content = await zip.generateAsync({ type: "blob" });
        
        // Download logic
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${project.name}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    } catch (e) {
        console.error("Export failed", e);
        alert("Failed to export project.");
    }
  };

  // --- File Actions ---

  const processFiles = useCallback(async (newFiles: File[]) => {
    if (!activeProjectId) return;

    // Reset selection mode if dragging in files
    setIsSelectionMode(false);
    setSelectedIds(new Set());

    const filesToProcess: File[] = [];

    // Pre-processing for ZIP files
    for (const file of newFiles) {
        if (file.name.endsWith('.zip') || file.type.includes('zip')) {
            try {
                const zip = await JSZip.loadAsync(file);
                const entries = Object.keys(zip.files);
                
                for (const filename of entries) {
                    const entry = zip.files[filename];
                    if (!entry.dir) {
                        const lowerName = filename.toLowerCase();
                        if (lowerName.endsWith('.png') || lowerName.endsWith('.mp4')) {
                            const blob = await entry.async('blob');
                            const type = lowerName.endsWith('.mp4') ? 'video/mp4' : 'image/png';
                            // Clean filename (remove path if present)
                            const cleanName = filename.split('/').pop() || filename;
                            const extractedFile = new File([blob], cleanName, { type });
                            filesToProcess.push(extractedFile);
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to unzip file", file.name, e);
                alert(`Failed to extract ${file.name}`);
            }
        } else {
            filesToProcess.push(file);
        }
    }
    
    if (filesToProcess.length === 0) return;

    const tempEntries: ComfyFile[] = filesToProcess.map(file => ({
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
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter(f => f.id !== fileId);
    });
    if (selectedFileId === fileId) setSelectedFileId(null);
  };

  // --- Selection Mode Logic ---

  const toggleSelectionMode = () => {
      if (isSelectionMode) {
          setIsSelectionMode(false);
          setSelectedIds(new Set());
      } else {
          setIsSelectionMode(true);
      }
  };

  const handleToggleSelect = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  const handleSelectAll = () => {
      if (selectedIds.size === files.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(files.map(f => f.id)));
      }
  };

  const handleDeleteSelected = async () => {
      if (selectedIds.size === 0) return;
      
      const count = selectedIds.size;
      if (!window.confirm(`Are you sure you want to delete ${count} selected items?`)) return;

      // Capture IDs in a local variable to be safe in closures
      const idsToDelete = Array.from(selectedIds) as string[];

      try {
          await db.deleteFiles(idsToDelete);
          
          setFiles(prev => {
              // Create a set for O(1) lookup during filter
              const deletedSet = new Set(idsToDelete);
              
              // Clean up object URLs
              prev.forEach(f => {
                  if (deletedSet.has(f.id) && f.previewUrl) {
                      URL.revokeObjectURL(f.previewUrl);
                  }
              });

              return prev.filter(f => !deletedSet.has(f.id));
          });

          setSelectedIds(new Set());
          setIsSelectionMode(false);
      } catch (e) {
          console.error("Failed to delete selected files", e);
          alert("Some files could not be deleted. Please try again.");
      }
  };

  const handleMoveSelected = async (targetProjectId: string) => {
      const ids = Array.from(selectedIds) as string[];
      try {
        await db.moveFiles(ids, targetProjectId);
        
        setFiles(prev => prev.filter(f => !selectedIds.has(f.id)));
        setSelectedIds(new Set());
        setIsSelectionMode(false);
        setShowMoveModal(false);
      } catch (e) {
        console.error("Failed to move files", e);
        alert("Failed to move files.");
      }
  };

  // --- Main Drag & Drop ---

  const onMainDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onMainDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFiles = Array.from(e.dataTransfer.files).filter((file: File) => 
      file.type.startsWith('image/png') || 
      file.type.startsWith('video/mp4') ||
      file.name.endsWith('.png') || 
      file.name.endsWith('.mp4') ||
      file.name.endsWith('.zip') ||
      file.type === 'application/zip' ||
      file.type.includes('zip')
    );
    
    if (droppedFiles.length > 0) {
      processFiles(droppedFiles);
    }
  };

  const activeProject = projects.find(p => p.id === activeProjectId);
  const selectedFile = files.find(f => f.id === selectedFileId);

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

  // --- Sidebar Content ---
  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
        {/* App Branding */}
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
                onExportProject={handleExportProject}
            />
        </div>
     </div>
  );

  return (
    <div className="flex h-[100dvh] bg-[#050505] text-gray-200 font-sans overflow-hidden selection:bg-blue-500/20">
      
      {/* Modals */}
      {selectedFile && (
        <DetailModal 
            file={selectedFile} 
            onClose={() => setSelectedFileId(null)} 
            onDelete={handleDeleteFile}
        />
      )}
      
      {showMoveModal && (
        <MoveModal 
           projects={projects}
           activeProjectId={activeProjectId}
           selectedCount={selectedIds.size}
           onConfirm={handleMoveSelected}
           onCancel={() => setShowMoveModal(false)}
        />
      )}

      {/* Mobile Menu Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Mobile Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out md:hidden ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebarContent}
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:block w-72 border-r border-gray-800 shrink-0 z-20">
        {sidebarContent}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#050505] relative">
          
        {/* Mobile Header */}
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

        {/* Content Scroll Area */}
        <div 
            className="flex-1 overflow-y-auto md:overflow-y-auto md:h-full custom-scrollbar relative"
            onDragOver={onMainDragOver}
            onDrop={onMainDrop}
        >
            {/* Toolbar */}
            <div className="sticky top-0 z-20 p-4 md:p-6 pb-2 md:pb-4 backdrop-blur-xl bg-[#050505]/80">
                <div className="flex items-center justify-between backdrop-blur-md bg-gray-900/40 p-1.5 rounded-xl border border-gray-800/60 shadow-sm transition-all">
                    
                    {/* Toolbar Left */}
                    <div className="flex items-center gap-3 pl-3">
                        {isSelectionMode ? (
                             <div className="flex items-center gap-3 text-blue-400">
                                <CheckSquare size={18} className="fill-blue-500/20" />
                                <span className="font-medium text-sm">{selectedIds.size} Selected</span>
                             </div>
                        ) : (
                             <>
                                <span className="text-gray-400">
                                    <Folder size={16} />
                                </span>
                                <span className="text-sm font-medium text-gray-200">
                                    {activeProject?.name}
                                </span>
                             </>
                        )}
                    </div>

                    {/* Toolbar Right */}
                    <div className="flex items-center gap-2">
                        {files.length > 0 && (
                            <>
                                {isSelectionMode ? (
                                    <>
                                        <button 
                                            onClick={handleSelectAll}
                                            className="px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                                        >
                                            {selectedIds.size === files.length ? 'Deselect All' : 'Select All'}
                                        </button>

                                        <div className="w-px h-4 bg-gray-700 mx-1"></div>

                                        <button 
                                            disabled={selectedIds.size === 0}
                                            onClick={() => setShowMoveModal(true)}
                                            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                                            title="Move Selected"
                                        >
                                            <FolderInput size={18} />
                                        </button>

                                        <button 
                                            disabled={selectedIds.size === 0}
                                            onClick={handleDeleteSelected}
                                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                                            title="Delete Selected"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                        
                                        <div className="w-px h-4 bg-gray-700 mx-1"></div>

                                        <button 
                                            onClick={toggleSelectionMode}
                                            className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-900/20 transition-all"
                                        >
                                            Done
                                        </button>
                                    </>
                                ) : (
                                    <>
                                       <button 
                                            onClick={toggleSelectionMode}
                                            className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                            title="Select Files"
                                        >
                                            <CheckSquare size={16} />
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* File Grid */}
            <div className="px-4 md:px-6 pb-24 relative z-10">
                {files.length === 0 && (
                    <div className="mt-8">
                        <DropZone 
                            onFilesDropped={processFiles} 
                            className="h-64 border-dashed border-gray-800 bg-gray-900/20 hover:bg-gray-900/40"
                        />
                        <p className="text-center text-gray-500 mt-4 text-xs uppercase tracking-wider">
                            Project is empty. Drop files or ZIP to start.
                        </p>
                    </div>
                )}

                {/* Grid View */}
                {files.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {files.map(file => (
                        <GridItem 
                            key={file.id} 
                            file={file} 
                            onClick={() => setSelectedFileId(file.id)}
                            onDelete={() => handleDeleteFile(file.id)}
                            selectionMode={isSelectionMode}
                            isSelected={selectedIds.has(file.id)}
                            onToggleSelect={() => handleToggleSelect(file.id)}
                        />
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
