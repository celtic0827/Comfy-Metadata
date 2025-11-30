
import * as React from 'react';
import { useState } from 'react';
import { Project } from '../types';
import { Folder, ChevronRight, Check, X } from 'lucide-react';

interface MoveModalProps {
  projects: Project[];
  activeProjectId: string; // The current project (cannot move here)
  selectedCount: number;
  onConfirm: (targetProjectId: string) => void;
  onCancel: () => void;
}

export const MoveModal: React.FC<MoveModalProps> = ({ 
  projects, 
  activeProjectId, 
  selectedCount, 
  onConfirm, 
  onCancel 
}) => {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  // Helper to render tree options (flat list for now for simplicity, but could be indented)
  // We'll organize them slightly by depth if needed, but a flat list with indentation is easier to render in a scrolling list.
  const getIndent = (id: string, depth = 0): number => {
      const p = projects.find(proj => proj.id === id);
      if (p && p.parentId) return getIndent(p.parentId, depth + 1);
      return depth;
  };

  const sortedProjects = React.useMemo(() => {
     // A simple sort isn't enough for a tree, but let's just list them. 
     // For a true Move dialog, often a flattened list of "Folder Name" is enough if names are unique, 
     // but let's try to group them.
     // Actually, let's just use the order provided but calculate depth.
     // Since sidebar controls order somewhat, let's trust the projects list or sort by name.
     return [...projects].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f1115] border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
            <div>
                <h3 className="text-white font-medium">Move {selectedCount} items</h3>
                <p className="text-xs text-gray-500 mt-1">Select a destination folder</p>
            </div>
            <button onClick={onCancel} className="text-gray-500 hover:text-white p-1 rounded-full hover:bg-gray-800">
                <X size={20} />
            </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
            {sortedProjects.map(proj => {
                const isCurrent = proj.id === activeProjectId;
                const isSelected = selectedTarget === proj.id;
                // Simple hierarchy visual hint (not full tree logic for brevity)
                const hasParent = !!proj.parentId;

                return (
                    <button
                        key={proj.id}
                        disabled={isCurrent}
                        onClick={() => setSelectedTarget(proj.id)}
                        className={`
                            w-full flex items-center gap-3 p-3 rounded-lg border text-sm transition-all
                            ${isCurrent 
                                ? 'opacity-50 cursor-not-allowed border-transparent bg-gray-900/50 text-gray-600' 
                                : isSelected
                                    ? 'bg-blue-600/20 border-blue-500 text-white'
                                    : 'bg-transparent border-transparent text-gray-300 hover:bg-gray-800 hover:text-white'
                            }
                        `}
                    >
                        <Folder size={16} className={isSelected ? 'text-blue-400' : 'text-gray-500'} />
                        <div className="flex flex-col items-start">
                            <span className="font-medium">{proj.name}</span>
                            {hasParent && (
                                <span className="text-[10px] text-gray-600">Sub-folder</span>
                            )}
                        </div>
                        {isCurrent && <span className="ml-auto text-[10px] italic">Current</span>}
                        {isSelected && <Check size={16} className="ml-auto text-blue-400" />}
                    </button>
                )
            })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900/30 flex justify-end gap-3">
            <button 
                onClick={onCancel}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
                Cancel
            </button>
            <button 
                disabled={!selectedTarget}
                onClick={() => selectedTarget && onConfirm(selectedTarget)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-900/20"
            >
                Move Here
            </button>
        </div>

      </div>
    </div>
  );
};
