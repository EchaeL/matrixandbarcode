// IndexedDB 저장소 래퍼. 앨범 한 건 = { id, ...필드 }
window.DB = (() => {
  const DB_NAME = 'matrixandbarcode';
  const STORE = 'albums';
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('barcode', 'barcode', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const result = Promise.resolve(fn(store));
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const wrap = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return {
    all: () => tx('readonly', s => wrap(s.getAll())),
    get: id => tx('readonly', s => wrap(s.get(id))),
    put: album => tx('readwrite', s => { s.put(album); return album; }),
    putMany: albums => tx('readwrite', s => { albums.forEach(a => s.put(a)); return albums.length; }),
    remove: id => tx('readwrite', s => { s.delete(id); }),
    clear: () => tx('readwrite', s => { s.clear(); }),
  };
})();
