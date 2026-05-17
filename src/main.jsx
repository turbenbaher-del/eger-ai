import React from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { reportError } from './lib/reportError.js';

window.addEventListener('unhandledrejection', e => { reportError(e.reason); });
window.onerror = (_msg, _src, _line, _col, err) => { reportError(err || _msg); };

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary><App /></ErrorBoundary>
);
