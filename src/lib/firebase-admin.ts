import { initializeApp, getApps, cert, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { requireEnv } from "@/lib/env";

let app: App | undefined;
let db: Firestore | undefined;

function getApp(): App {
  if (app) return app;
  if (getApps().length) { app = getApps()[0]; return app; }
  const projectId = requireEnv("GCP_PROJECT");
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  app = initializeApp({
    projectId,
    credential: sa ? cert(JSON.parse(sa)) : applicationDefault(),
  });
  return app;
}

export function getDb(): Firestore {
  if (db) return db;
  db = getFirestore(getApp(), process.env.FIRESTORE_DATABASE ?? "(default)");
  return db;
}
