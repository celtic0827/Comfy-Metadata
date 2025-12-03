
import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Project } from '../types';
import { 
  Folder, 
  FolderOpen, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronDown, 
  Search,
  Pencil,
  Archive,
  DownloadCloud,
  UploadCloud,
  Database
} from 'lucide-react';

interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string, parentId: string | null) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  onToggleProject: (id: string) => void;
  onMoveProject: (projectId: string, newParentId: string | null) => void;
  onExportProject: (projectId: string) => void;
  onBackupSystem: () => void;
  onRestoreSystem: (file: File) => void;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onRenameProject,
  onToggleProject,
  onMoveProject,
  onExportProject,
  onBackupSystem,
  onRestoreSystem
}) => {
  const [creatingForParentId, setCreatingForParentId] = useState<string | null | undefined>(undefined);
  const [newProjectName, setNewProjectName] = useState('');
  
  // Renaming State
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Drag and Drop State
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (editingProjectId && editInputRef.current) {
        editInputRef.current.focus();
        editInputRef.current.select();
    }
  }, [editingProjectId]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim()) {
      onCreateProject(newProjectName.trim(), creatingForParentId ?? null);
      setNewProjectName('');
      setCreatingForParentId(undefined);
    }
  };

  const handleCancelCreate = () => {
    setNewProjectName('');
    setCreatingForParentId(undefined);
  };

  const startRenaming = (project: Project, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setEditingProjectId(project.id);
      setEditName(project.name);
  };

  const handleRenameSubmit = (e: React.FormEvent | React.FocusEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (editingProjectId && editName.trim()) {
        onRenameProject(editingProjectId, editName.trim());
        setEditingProjectId(null);
        setEditName('');
    } else {
        setEditingProjectId(null);
    }
  };

  const handleCancelRename = () => {
      setEditingProjectId(null);
      setEditName('');
  };

  const handleRestoreClick = () => {
    restoreInputRef.current?.click();
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onRestoreSystem(e.target.files[0]);
    }
    // Reset input so same file can be selected again if needed
    if (e.target) e.target.value = '';
  };

  const CreationForm = () => (
    <form 
      onSubmit={handleCreateSubmit} 
      className="flex items-center gap-1 pl-6 pr-2 py-1 bg-blue-500/10 border-l-2 border-blue-500 mb-1 animate-in fade-in duration-200"
      onClick={e => e.stopPropagation()}
    >
        <Folder size={14} className="text-blue-400 shrink-0" />
        <input
            autoFocus
            type="text"
            placeholder="Folder name..."
            className="w-full bg-transparent text-sm text-white focus:outline-none placeholder-blue-300/50 font-medium min-w-0"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && handleCancelCreate()}
            onBlur={() => !newProjectName && handleCancelCreate()}
        />
    </form>
  );

  // Recursive Tree Component
  const ProjectTreeItem: React.FC<{
    project: Project;
    depth: number;
  }> = ({ project, depth }) => {
    const children = projects.filter(p => p.parentId === project.id);
    const isActive = activeProjectId === project.id;
    const hasChildren = children.length > 0;
    const isCreatingHere = creatingForParentId === project.id;
    const isRenaming = editingProjectId === project.id;
    const isDragOver = dragOverProjectId === project.id;

    // DnD Handlers
    const handleDragStart = (e: React.DragEvent) => {
        setIsDragging(true);
        e.dataTransfer.setData('project-id', project.id);
        e.stopPropagation();
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Necessary to allow dropping
        e.stopPropagation();
        if (isDragging) {
             setDragOverProjectId(project.id);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragOverProjectId === project.id) {
           setDragOverProjectId(null);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverProjectId(null);
        setIsDragging(false);
        const sourceId = e.dataTransfer.getData('project-id');
        if (sourceId && sourceId !== project.id) {
            onMoveProject(sourceId, project.id);
        }
    };

    return (
      <div className="select-none">
        <div 
          draggable={!isRenaming}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            group flex items-center gap-1.5 py-1.5 pr-2 cursor-pointer transition-all relative border border-transparent
            ${isActive && !isRenaming && !isDragOver
              ? 'bg-blue-500/10 text-white' 
              : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}
            ${isDragOver ? 'bg-blue-500/30 border-blue-500/50 z-10' : ''}
          `}
          style={{ paddingLeft: `${(depth * 16) + 12}px` }}
          onClick={() => !isRenaming && onSelectProject(project.id)}
        >
          {/* Active Indicator Line */}
          {isActive && !isRenaming && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-500" />}

          {/* Toggle Arrow */}
          <div 
            className={`p-0.5 rounded text-gray-500 hover:text-white transition-colors ${hasChildren ? 'visible' : 'invisible'}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleProject(project.id);
            }}
          >
            {project.isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </div>

          {/* Icon */}
          <div className={`shrink-0 ${isActive && !isRenaming ? 'text-blue-400' : 'text-gray-500 group-hover:text-gray-300'}`}>
            {project.isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
          </div>

          {/* Name or Rename Input */}
          <div className="flex-1 min-w-0 relative h-5 flex items-center">
            {isRenaming ? (
                <form 
                    onSubmit={handleRenameSubmit} 
                    className="absolute -left-2 -right-2 -top-1.5 h-8 z-50" 
                    onClick={e => e.stopPropagation()}
                >
                    <input
                        ref={editInputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleRenameSubmit}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                handleCancelRename();
                            }
                        }}
                        className="w-full h-full bg-gray-900 text-sm text-white px-2 rounded-md border border-blue-500 focus:outline-none shadow-xl font-medium"
                    />
                </form>
            ) : (
                <span className="truncate text-sm font-medium leading-5 w-full">{project.name}</span>
            )}
          </div>

          {/* Actions (Hover only) */}
          {!isRenaming && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCreatingForParentId(project.id);
                        setNewProjectName('');
                        if (!project.isOpen) onToggleProject(project.id);
                    }}
                    className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-white"
                    title="Add Sub-folder"
                >
                    <Plus size={12} />
                </button>
                <button
                    onClick={(e) => startRenaming(project, e)}
                    className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-blue-400"
                    title="Rename"
                >
                    <Pencil size={12} />
                </button>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onExportProject(project.id);
                    }}
                    className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-green-400"
                    title="Archive to ZIP"
                >
                    <Archive size={12} />
                </button>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteProject(project.id);
                    }}
                    className="p-1 rounded hover:bg-red-900/50 hover:text-red-400 text-gray-500"
                    title="Delete Folder"
                >
                    <Trash2 size={12} />
                </button>
            </div>
          )}
        </div>

        {/* Children & Creation Form */}
        {project.isOpen && (
          <div>
            {isCreatingHere && (
               <div style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
                  <CreationForm />
               </div>
            )}
            {children.map(child => (
              <ProjectTreeItem
                key={child.id}
                project={child}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const rootProjects = projects.filter(p => !p.parentId);

  const handleRootDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
  };
  
  const handleRootDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      setDragOverProjectId(null);
      const sourceId = e.dataTransfer.getData('project-id');
      if (sourceId) {
          onMoveProject(sourceId, null);
      }
  };

  return (
    <div 
        className="w-full h-full flex flex-col bg-transparent"
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
    >
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-900/30">
        <h2 className="text-gray-400 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
          EXPLORER
        </h2>
        <div className="flex gap-1">
            <button 
            onClick={() => {
                setCreatingForParentId(null);
                setNewProjectName('');
            }}
            className="p-1 text-gray-500 hover:text-white hover:bg-white/10 rounded transition-all"
            title="New Project"
            >
            <Plus size={14} />
            </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pt-2 pb-4 space-y-0.5 custom-scrollbar">
        {creatingForParentId === null && (
           <div className="px-2">
             <CreationForm />
           </div>
        )}

        {rootProjects.length === 0 && creatingForParentId === undefined && (
             <div className="flex flex-col items-center justify-center py-10 text-gray-600 gap-2">
                <Search size={24} className="opacity-20" />
                <span className="text-xs">No projects found</span>
            </div>
        )}

        {rootProjects.map(project => (
            <ProjectTreeItem key={project.id} project={project} depth={0} />
        ))}
      </div>

      {/* System Footer */}
      <div className="p-3 border-t border-gray-800 bg-gray-900/50 mt-auto">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Database size={10} />
              <span>Data Management</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
              <button 
                 onClick={onBackupSystem}
                 className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border border-gray-700 hover:border-gray-600"
                 title="Export all data to ZIP"
              >
                  <DownloadCloud size={16} />
                  <span className="text-[10px] font-medium">Backup</span>
              </button>
              
              <button 
                 onClick={handleRestoreClick}
                 className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border border-gray-700 hover:border-gray-600"
                 title="Import data from ZIP"
              >
                  <UploadCloud size={16} />
                  <span className="text-[10px] font-medium">Restore</span>
              </button>
              
              <input 
                 ref={restoreInputRef}
                 type="file" 
                 accept=".zip"
                 className="hidden"
                 onChange={handleRestoreFileChange}
              />
          </div>
      </div>
    </div>
  );
};
