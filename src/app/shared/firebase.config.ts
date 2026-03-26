import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { firebaseConfigValues } from './firebase.config.local';

export const firebaseApp = initializeApp(firebaseConfigValues);
export const firebaseAuth = getAuth(firebaseApp);
