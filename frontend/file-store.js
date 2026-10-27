// 파일은 sessionStorage에 넣을 수 없으므로 IndexedDB에 보관합니다.
// 탭별 ID를 사용하고, 새 파일을 선택하면 이전 파일을 교체합니다.
const documentFileStore = {
  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("documentCheckerFiles", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("파일 저장소를 열 수 없습니다."));
    });
  },
  async access(mode, action) {
    const db = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction("files", mode);
        const request = action(transaction.objectStore("files"));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = transaction.onerror = () => reject(new Error("파일 보관에 실패했습니다. 브라우저 저장 공간을 확인하세요."));
      });
    } finally { db.close(); }
  },
  async save(file) {
    const id = sessionStorage.getItem("documentCheckerFileId") || crypto.randomUUID();
    sessionStorage.setItem("documentCheckerFileId", id);
    await this.access("readwrite", (store) => store.put(file, id));
    return id;
  },
  async load(id) {
    if (!id || id !== sessionStorage.getItem("documentCheckerFileId")) return null;
    return this.access("readonly", (store) => store.get(id));
  }
};
