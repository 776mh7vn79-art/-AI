export const TRIAL_DB_NAME = "writing-motion-lab-trials";
export const TRIAL_DB_VERSION = 1;
const STORE_NAME = "trials";

export function trialKey(participantId, trialId) {
  const participant = String(participantId || "").trim();
  const trial = String(trialId || "").trim();
  if (!participant || !trial) throw new Error("参加者IDと試行IDを入力してください。");
  return JSON.stringify([participant, trial]);
}

export function validateTrialRecord(record) {
  if (!record || typeof record !== "object" || !record.metadata || !Array.isArray(record.frames)) throw new Error("試行データの形式が正しくありません。");
  if ("video" in record || "videoBlob" in record || "videoData" in record) throw new Error("動画本体を含むデータは保存できません。");
  const participantId = String(record.metadata.participantId || "").trim();
  const trialId = String(record.metadata.trialId || "").trim();
  return { ...record, participant_id: participantId, trial_id: trialId, key: trialKey(participantId, trialId), schema_version: 1 };
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

export class TrialStore {
  constructor(indexedDBFactory = globalThis.indexedDB) {
    this.factory = indexedDBFactory;
    this.dbPromise = null;
  }

  open() {
    if (!this.factory) return Promise.reject(new Error("このブラウザではIndexedDBを利用できません。"));
    if (!this.dbPromise) this.dbPromise = new Promise((resolve, reject) => {
      const request = this.factory.open(TRIAL_DB_NAME, TRIAL_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
          store.createIndex("participant_id", "participant_id", { unique: false });
          store.createIndex("saved_at", "saved_at", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDBを開けませんでした。"));
      request.onblocked = () => reject(new Error("別タブがデータベースを使用中です。ほかのアプリタブを閉じて再試行してください。"));
    }).catch(error => { this.dbPromise = null; throw error; });
    return this.dbPromise;
  }

  async transact(mode, operation) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      let tx, result;
      try {
        tx = db.transaction(STORE_NAME, mode);
        result = operation(tx.objectStore(STORE_NAME));
      } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction was aborted"));
    });
  }

  async saveMany(records) {
    const clean = records.map(validateTrialRecord);
    if (!clean.length) return 0;
    await this.transact("readwrite", store => { for (const record of clean) store.put(record); });
    return clean.length;
  }

  async save(record) { await this.saveMany([record]); return validateTrialRecord(record).key; }

  async list(participantId = "") {
    const filter = String(participantId || "").trim();
    const records = await this.transact("readonly", store => requestResult(store.getAll()));
    return records.filter(record => !filter || record.participant_id === filter).sort((a,b) => String(b.saved_at || "").localeCompare(String(a.saved_at || "")));
  }

  async get(key) { return this.transact("readonly", store => requestResult(store.get(key))); }
  async delete(key) { await this.transact("readwrite", store => store.delete(key)); }
  async clear() { await this.transact("readwrite", store => store.clear()); }
  close() { this.dbPromise?.then(db => db.close()).catch(() => {}); this.dbPromise = null; }
}

