import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getAnalytics, logEvent as fbLogEvent } from 'firebase/analytics';
import { getMessaging, isSupported } from 'firebase/messaging';

const app = initializeApp({
  apiKey: "AIzaSyDAGn8KaXwBMIkNEJ7NdjBS6lEV2JX_C-0",
  authDomain: "eger-ai.firebaseapp.com",
  projectId: "eger-ai",
  storageBucket: "eger-ai.firebasestorage.app",
  messagingSenderId: "785362609990",
  appId: "1:785362609990:web:203c5e3edf010e732ae747"
});

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const storage = getStorage(app);
export const functionsRegion = getFunctions(app, 'europe-west3');
let _analytics; try { _analytics = getAnalytics(app); } catch(e) {}
export const logEvent = (name, params={}) => { try { _analytics && fbLogEvent(_analytics, name, params); } catch(e) {} };
export const VAPID_KEY = 'BP9Ol8dxGFtYScy7kqla61Pfkf7ek-o3Qi08TofmzNV_kFCziFQXouSzPYkHPOo-7-x_eC7zEKUPq103NOOZaDg';

// messaging — async because isSupported() is a promise
export let messaging = null;
isSupported().then(ok => { if (ok) messaging = getMessaging(app); }).catch(() => {});
