import { logEvent, db } from '../firebase.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export function reportError(error, extra = {}) {
  const message = String(error?.message || error || 'Unknown error').slice(0, 500);
  logEvent('crash', { error_message: message.slice(0, 100) });
  addDoc(collection(db, 'crash_reports'), {
    message,
    stack: String(error?.stack || '').slice(0, 1000),
    componentStack: String(extra?.componentStack || '').slice(0, 1000),
    url: window.location.href.slice(0, 500),
    ua: navigator.userAgent.slice(0, 200),
    ts: serverTimestamp(),
  }).catch(() => {});
}
