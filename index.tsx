import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (e: any) {
  console.error("React Mount Error:", e);
  // Fallback if window.onerror doesn't catch it for some reason
  rootElement.innerHTML = `
    <div style="padding: 20px; color: #ef4444; font-family: monospace;">
      <h1>Mount Error</h1>
      <pre>${e.message}\n${e.stack}</pre>
    </div>
  `;
}