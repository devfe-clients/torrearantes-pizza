/**
 * Inicialização do Firebase (client SDK).
 *
 * CONFIGURAÇÃO: preencha as variáveis abaixo no arquivo .env (prefixo VITE_).
 * Nenhuma chave está hardcoded — as chaves do Firebase Web são públicas por
 * natureza, a segurança real vem das Security Rules do Firestore
 * (ver firebase/firestore.rules).
 *
 *   VITE_FIREBASE_API_KEY=
 *   VITE_FIREBASE_AUTH_DOMAIN=
 *   VITE_FIREBASE_PROJECT_ID=
 *   VITE_FIREBASE_STORAGE_BUCKET=
 *   VITE_FIREBASE_MESSAGING_SENDER_ID=
 *   VITE_FIREBASE_APP_ID=
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"] as string | undefined,
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"] as string | undefined,
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"] as string | undefined,
  storageBucket: import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"] as string | undefined,
  messagingSenderId: import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"] as string | undefined,
  appId: import.meta.env["VITE_FIREBASE_APP_ID"] as string | undefined,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let cached: { app: FirebaseApp; db: Firestore; auth: Auth } | null = null;

export function getFirebase() {
  if (cached) return cached;
  if (typeof window === "undefined") throw new Error("Firebase só pode ser usado no browser.");
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase não configurado. Preencha as variáveis VITE_FIREBASE_* no arquivo .env.",
    );
  }
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig as Record<string, string>);
  cached = { app, db: getFirestore(app), auth: getAuth(app) };
  return cached;
}
