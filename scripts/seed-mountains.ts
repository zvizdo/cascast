import { initializeApp, applicationDefault, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { MOUNTAINS } from "../src/lib/mountains-data";

function db() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    initializeApp({
      projectId: process.env.GCP_PROJECT ?? "mountain-weatherman-app",
      credential: sa ? cert(JSON.parse(sa)) : applicationDefault(),
    });
  }
  const dbId = process.env.FIRESTORE_DATABASE;
  return dbId ? getFirestore(getApp(), dbId) : getFirestore();
}

export async function seedMountains() {
  const firestore = db();
  const batch = firestore.batch();
  for (const m of MOUNTAINS) {
    const ref = firestore.collection("mountains").doc(m.slug);
    batch.set(ref, { ...m, createdAt: new Date() }, { merge: true });
  }
  await batch.commit();
  return MOUNTAINS.length;
}

if (process.argv[1] && process.argv[1].endsWith("seed-mountains.ts")) {
  seedMountains()
    .then((n) => { console.log(`Seeded ${n} mountains.`); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
