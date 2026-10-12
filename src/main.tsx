import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && (
      reason.message?.includes('WebSocket') || 
      reason.message?.includes('vite') ||
      (reason.stack && reason.stack.includes('vite/client'))
    )) {
      event.preventDefault();
      console.warn('Silenced HMR WebSocket/Vite unhandled rejection:', reason.message);
    }
  });

  window.addEventListener('error', (event) => {
    const message = event.message;
    if (message && (
      message.includes('WebSocket') || 
      message.includes('vite')
    )) {
      event.preventDefault();
      console.warn('Silenced HMR WebSocket/Vite error:', message);
    }
  });
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
