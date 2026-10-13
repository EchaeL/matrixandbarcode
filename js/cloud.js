// 구글 로그인 + Firestore 저장소. 경로: users/{uid}/albums/{albumId}
// Firebase를 불러오지 못하면(오프라인 등) available = false 이고 앱은 기기 저장소만 사용
window.Cloud = (() => {
  const available = typeof firebase !== 'undefined' && !!window.FIREBASE_CONFIG;
  let auth, db;

  if (available) {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    auth = firebase.auth();
    db = firebase.firestore();
    // 오프라인에서도 보고 수정할 수 있도록 캐시 (실패해도 동작에는 지장 없음)
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  }

  function onAuth(cb) {
    if (!available) { cb(null); return; }
    auth.onAuthStateChanged(cb);
  }

  async function signIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await auth.signInWithPopup(provider);
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
        await auth.signInWithRedirect(provider);
      } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        throw err;
      }
    }
  }

  const signOut = () => auth.signOut();

  // Firestore는 undefined 값을 저장하지 못하므로 제거
  const clean = a => JSON.parse(JSON.stringify(a));

  // 로그인한 사용자의 앨범 저장소 (기기 저장소 DB와 같은 모양)
  function store(uid) {
    const col = db.collection('users').doc(uid).collection('albums');
    return {
      all: async () => (await col.get()).docs.map(d => d.data()),
      put: async album => { await col.doc(album.id).set(clean(album)); return album; },
      // 표지 이미지 때문에 한 번에 보내는 양을 작게 나눔
      putMany: async albums => {
        for (let i = 0; i < albums.length; i += 20) {
          const batch = db.batch();
          albums.slice(i, i + 20).forEach(a => batch.set(col.doc(a.id), clean(a)));
          await batch.commit();
        }
        return albums.length;
      },
      remove: id => col.doc(id).delete(),
      clear: async () => {
        const snap = await col.get();
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = db.batch();
          snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      },
      // 다른 기기에서 바뀐 내용도 실시간으로 반영
      watch: cb => col.onSnapshot(snap => cb(snap.docs.map(d => d.data())), err => console.error(err)),
    };
  }

  return { available, onAuth, signIn, signOut, store };
})();
