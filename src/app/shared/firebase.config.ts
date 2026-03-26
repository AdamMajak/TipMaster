import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDNDV7Z4GM76u1T7fG2Q2wabFRwx9g2Nl4',
  authDomain: 'tipmaster-848cf.firebaseapp.com',
  projectId: 'tipmaster-848cf',
  storageBucket: 'tipmaster-848cf.firebasestorage.app',
  messagingSenderId: '333282943244',
  appId: '1:333282943244:web:0243a47b0f4e03ce37a929',
  measurementId: 'G-EWQP8PEQEJ',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
