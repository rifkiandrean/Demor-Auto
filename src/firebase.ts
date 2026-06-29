import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Configuration from firebase-applet-config.json
const firebaseConfig = {
  apiKey: "AIzaSyCLOGoeA56Vebd1hJYqiVMoUNvD6EQN-1k",
  authDomain: "mypangandaran-a8bf7.firebaseapp.com",
  projectId: "mypangandaran-a8bf7",
  storageBucket: "mypangandaran-a8bf7.firebasestorage.app",
  messagingSenderId: "880940278222",
  appId: "1:880940278222:web:7eca1e4042a9593f8b8b9f"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with robust multi-tab offline caching
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  },
  "ai-studio-demorauto-aebd3fd3-4a28-436e-9a99-c139b083dfa5"
);
