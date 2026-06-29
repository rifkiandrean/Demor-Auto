import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Configuration from firebase-applet-config.json
const firebaseConfig = {
  apiKey: "AIzaSyDz8Eg_ULSYOb01y1Mzl_p9fl7zaRXKqJ4",
  authDomain: "ordinal-return-zkm1r.firebaseapp.com",
  projectId: "ordinal-return-zkm1r",
  storageBucket: "ordinal-return-zkm1r.firebasestorage.app",
  messagingSenderId: "957466558202",
  appId: "1:957466558202:web:61b978147923c3ead31343"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with robust multi-tab offline caching
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});
