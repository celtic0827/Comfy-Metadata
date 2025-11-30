# ComfyUI Metadata Extractor

A modern, browser-based tool to organize, view, and extract generation metadata (prompts, workflows) from [ComfyUI](https://github.com/comfyanonymous/ComfyUI) images (`.png`) and videos (`.mp4`).

## ✨ Features

- **Metadata Extraction**: Instantly view Positive Prompts, Negative Prompts, and the raw Workflow JSON embedded in ComfyUI generations.
- **Local Storage**: Built on **IndexedDB**, ensuring all your files stay locally in your browser. No data is uploaded to any server.
- **Project Organization**: Create, rename, and nest folders to keep your generations organized.
- **Drag & Drop Import**: Support for dragging and dropping PNG images, MP4 videos, and ZIP archives containing multiple files.
- **Batch Operations**: Select multiple files to move between folders or delete in bulk.
- **Export & Backup**: Download entire project folders as a ZIP file.
- **Responsive UI**: A clean, dark-themed interface built with Tailwind CSS.

## 🚀 Getting Started

This project is built with React and Vite.

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/comfy-metadata-extractor.git
   cd comfy-metadata-extractor
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser at `http://localhost:5173`

## 🛠️ Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Database**: IndexedDB (via `idb`)
- **Icons**: Lucide React
- **Utilities**: JSZip, uuid

## 📖 Usage

1. **Create a Project**: Use the sidebar to create a new folder.
2. **Import Files**: Drag and drop ComfyUI PNGs or MP4s into the drop zone. You can also drop a ZIP file to import multiple images at once.
3. **View Metadata**: Click on any image to open the detail view. You can copy prompts or view the raw JSON.
4. **Organize**: Use the selection mode to move files between folders or delete them.

## 📄 License

MIT
