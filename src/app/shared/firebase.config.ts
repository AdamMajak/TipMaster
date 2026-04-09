import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { firebaseConfigValues } from './firebase.config.local';

function hasRequiredFirebaseConfig(config: FirebaseOptions): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

export const firebaseInitError: string | null = hasRequiredFirebaseConfig(firebaseConfigValues)
  ? null
  : 'Firebase Auth is not configured. Fill in src/app/shared/firebase.config.local.ts (apiKey/authDomain/projectId/appId).';

export const firebaseApp: FirebaseApp | null = firebaseInitError ? null : initializeApp(firebaseConfigValues);
export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;
