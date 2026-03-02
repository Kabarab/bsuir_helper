import React from 'react'
import ReactDOM from 'react-dom/client'
import WebApp from '@twa-dev/sdk'
import App from './App.jsx'
import './index.css'
import ErrorBoundary from './components/ErrorBoundary.jsx'

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element #root not found in index.html');

  try {
    WebApp.ready();
    WebApp.expand();
  } catch (e) {
    console.error('WebApp.ready() failed:', e);
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (error) {
  console.error('Critical mounting error:', error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="padding: 20px; color: #ff4d4f; background: #1c1c1d; min-height: 100vh; font-family: sans-serif;">
      <h2 style="font-size: 18px; font-weight: bold;">Initial Mounting Error</h2>
      <pre style="font-size: 12px; margin-top: 10px; white-space: pre-wrap; opacity: 0.8;">${error?.toString()}</pre>
    </div>`;
  }
}
