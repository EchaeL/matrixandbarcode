(() => {
  const { esc, uid } = Util;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const STATUS_LABEL = { owned: '보유 중', wishlist: '위시리스트', sold: '처분함' };
  const DISC_TYPES = ['CD', 'SACD', 'Hybrid SACD', 'SHM-CD', 'Blu-spec CD', 'HQCD', 'CD-R', 'DVD', 'Blu-ray', '기타'];
  const PREF_KEY = 'mab-prefs';

  let albums = [];
  let filter = { status: 'all', artist: null };
  let editingAlbumId = null;   // 앨범 폼에서 수정 중인 앨범
  let formCover = null;        // 앨범 폼의 표지 data URL
  let discTarget = null;       // { albumId, discId } — CD 폼 대상
  let prefs = loadPrefs();
  let store = DB;              // 로그인 전: 기기 저장소(DB), 로그인 후: 계정 저장소(Cloud)
  let user = null;
  let unwatch = null;
  let loaded = false;

  // ---------- 초기화 ----------
  async function init() {
    // 저장소가 늦거나 실패해도 버튼은 동작하도록 이벤트를 먼저 연결
    if (prefs.sort) $('#sort').value = prefs.sort;
    setLayout(prefs.layout || 'grid', false);
    bindEvents();
    renderShell();
    route();

    Cloud.onAuth(u => handleAuth(u).catch(err => toast('불러오기 실패: ' + err.message)));
  }

  // 기기 저장소의 앨범 (이전 버전 형식은 변환해서 다시 저장)
  async function loadLocal() {
    const stored = await DB.all();
    const migrated = [];
    const list = stored.map(a => {
      const n = normalize(a);
      if (n !== a) migrated.push(n);
      return n;
    });
    if (migrated.length) await DB.putMany(migrated);
    return list;
  }

  async function handleAuth(u) {
    if (unwatch) { unwatch(); unwatch = null; }
    user = u;
    if (u) {
      store = Cloud.store(u.uid);
      await moveLocalToCloud();
      unwatch = store.watch(list => {
        albums = list.map(normalize);
        loaded = true;
        refresh();
      });
    } else {
      store = DB;
      albums = await loadLocal();
      loaded = true;
      refresh();
    }
    renderAccount();
  }

  // 로그인 전에 이 기기에 등록해 둔 앨범을 계정으로 옮김
  async function moveLocalToCloud() {
    const local = await loadLocal();
    if (!local.length) return;
    if (!await ask({ title: '앨범을 계정으로 옮길까요?', message: `이 기기에 저장된 앨범 ${local.length}개를 내 계정으로 옮깁니다. 옮기면 다른 기기에서도 볼 수 있어요.`, ok: '옮기기' })) return;
    toast('앨범을 옮기는 중…');
    await store.putMany(local);
    await DB.clear();
    toast(`앨범 ${local.length}개를 계정으로 옮겼습니다`);
  }

  async function signIn() {
    try { await Cloud.signIn(); } catch (err) { toast('로그인 실패: ' + (err.message || err.code)); }
  }

  async function signOut() {
    if (!await ask({ title: '로그아웃할까요?', message: '앨범은 계정에 그대로 남아 있습니다.', ok: '로그아웃' })) return;
    await Cloud.signOut();
    toast('로그아웃했습니다');
  }

  function avatarHTML() {
    const name = user.displayName || user.email || '내 계정';
    return user.photoURL
      ? `<img src="${esc(user.photoURL)}" alt="" referrerpolicy="no-referrer">`
      : `<span class="avatar">${esc(name.slice(0, 1))}</span>`;
  }

  function renderAccount() {
    const name = user ? (user.displayName || user.email || '내 계정') : '';
    let side, settings;
    if (!Cloud.available) {
      side = settings = '<p class="account-note">서버에 연결할 수 없어 이 기기에만 저장합니다.</p>';
    } else if (!user) {
      side = `
        <p class="account-note">지금은 이 기기에만 저장돼요.<br>로그인하면 어느 기기에서나 볼 수 있어요.</p>
        <button class="btn block" data-action="signin">${GOOGLE_ICON}Google로 로그인</button>`;
      settings = `
        <p class="muted">지금은 이 기기에만 저장돼요. 로그인하면 어느 기기에서나 같은 컬렉션을 볼 수 있어요.</p>
        <button class="btn" data-action="signin">${GOOGLE_ICON}Google로 로그인</button>`;
    } else {
      const row = `<div class="account-user">${avatarHTML()}<div><b>${esc(name)}</b><span>계정에 자동 저장 중</span></div></div>`;
      side = row + '<button class="link-btn" data-action="signout">로그아웃</button>';
      settings = row + '<button class="btn" data-action="signout">로그아웃</button>';
    }
    $('#account').innerHTML = side;
    $('#settings-account').innerHTML = settings;
    $('#mb-account').innerHTML = user ? avatarHTML()
      : '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="9" r="3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
    $('#settings-storage').textContent = user
      ? `${user.email || '구글 계정'}에 자동으로 저장되고 있어요. 다른 기기에서 같은 계정으로 로그인하면 똑같이 보입니다.`
      : '지금은 이 기기의 브라우저에만 저장됩니다. Google로 로그인하면 계정에 저장되어 어느 기기에서나 볼 수 있어요.';
  }

  // 설정의 "화면 모드": 감지된 기기 정보와 현재 선택
  function renderViewPref() {
    const i = Device.info();
    const kind = { phone: '휴대폰', tablet: '태블릿', desktop: '컴퓨터' }[i.kind];
    const auto = Device.pref() === 'auto';
    $('#device-info').textContent =
      `이 기기: ${i.name} (${kind}) · 화면 ${i.screen} · 지금 ${Device.view() === 'mobile' ? '모바일' : 'PC'} 버전으로 보는 중` +
      (auto ? '' : ' (직접 선택함)');
    $$('#view-pref button').forEach(b => {
      const on = b.dataset.pref === Device.pref();
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on);
    });
  }

  // 기록(아티스트별) 페이지
  function renderArtists() {
    const groups = new Map();
    albums.forEach(a => {
      if (!groups.has(a.artist)) groups.set(a.artist, []);
      groups.get(a.artist).push(a);
    });
    const list = [...groups.entries()].sort((x, y) => x[0].localeCompare(y[0], 'ko'));
    $('#artist-list').innerHTML = list.length ? list.map(([name, items]) => {
      const withCover = items.find(a => a.cover) || items[0];
      const discs = items.reduce((n, a) => n + a.discs.length, 0);
      return `
        <button class="artist-row" data-artist="${esc(name)}">
          ${coverHTML(withCover)}
          <span class="artist-name">${esc(name)}</span>
          <span class="artist-count">앨범 ${items.length} · 디스크 ${discs}</span>
        </button>`;
    }).join('') : '<p class="muted no-result">아직 등록된 앨범이 없습니다.</p>';
  }

  const GOOGLE_ICON = '<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2 1.4-4.8 2.3-8.7 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.2C6.6 42.6 14.6 48 24 48z"/></svg>';

  // 정렬·통계용 발매 연도 (전체 날짜가 있으면 그 연도)
  function yearOf(a) {
    return a.releaseDate ? parseInt(a.releaseDate.slice(0, 4), 10) || 0 : Number(a.year) || 0;
  }

  // 발매일 표시: 2019-10-29 → 2019. 10. 29.
  function releaseText(a) {
    if (a.releaseDate) {
      const [y, m, d] = a.releaseDate.split('-');
      return `${y}. ${Number(m)}. ${Number(d)}.`;
    }
    return a.year ? String(a.year) : '';
  }

  // 이전 버전(앨범 단위 매트릭스) 데이터를 앨범 → CD 구조로 변환
  function normalize(a) {
    if (Array.isArray(a.discs)) return a;
    const matrix = a.matrix || [];
    const count = Math.max(Number(a.discs) || 1, matrix.length, 1);
    const fmt = a.format || 'CD';
    const discs = [];
    for (let i = 0; i < count; i++) {
      const m = matrix[i] || {};
      let type = DISC_TYPES.includes(fmt) ? fmt : 'CD';
      if (/DVD/.test(fmt) && i > 0) type = 'DVD';
      if (/Blu-ray/.test(fmt) && i > 0) type = 'Blu-ray';
      discs.push({
        id: uid(), type, title: '',
        matrix: m.code || '', mastering: m.mastering || '', mould: m.mould || '',
        tracklist: i === 0 ? (a.tracklist || '') : '', notes: '',
      });
    }
    const { matrix: _m, format: _f, tracklist: _t, ...rest } = a;
    return { ...rest, discs };
  }

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
  }
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* 무시 */ }
  }

  // ---------- 라우팅 ----------
  // 데이터가 바뀌었을 때 현재 화면만 다시 그림 (스크롤 유지)
  function refresh() {
    renderShell();
    renderPage(false);
  }

  function route() {
    renderPage(true);
  }

  function renderPage(scrollTop) {
    const hash = location.hash.replace(/^#/, '') || '/';
    const [, page, id] = hash.split('/');
    let active = 'list';
    if (page === 'album' && id) active = 'album';
    else if (page === 'stats') active = 'stats';
    else if (page === 'settings') active = 'settings';
    else if (page === 'artists') active = 'artists';

    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + active));
    if (active === 'album') renderAlbumPage(decodeURIComponent(id));
    if (active === 'list') renderList();
    if (active === 'stats') renderStats();
    if (active === 'artists') renderArtists();
    if (active === 'settings') renderViewPref();
    updateNavActive(active);
    if (scrollTop) {
      document.body.classList.remove('nav-open');
      window.scrollTo(0, 0);
    }
  }

  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }

  // ---------- 이벤트 ----------
  function bindEvents() {
    window.addEventListener('hashchange', route);

    document.addEventListener('click', e => {
      if (e.target.closest('[data-action="add"]')) { e.preventDefault(); openAlbumForm(); }
      if (e.target.closest('[data-action="signin"]')) { e.preventDefault(); signIn(); }
      if (e.target.closest('[data-action="signout"]')) { e.preventDefault(); signOut(); }
      const closer = e.target.closest('[data-close]');
      if (closer) closer.closest('dialog').close();
    });

    // 팝업 바깥(어두운 배경)을 누르면 닫기. 앨범 폼에 입력 중이면 한 번 확인
    $$('dialog').forEach(d => d.addEventListener('click', async e => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside) return;
      if (d.id === 'dlg-album' && $('#album-form').elements.title.value.trim() &&
        !await ask({ title: '입력 중인 내용을 닫을까요?', message: '저장하지 않은 내용은 사라집니다.', ok: '닫기' })) return;
      d.close();
    }));

    // 확인 팝업 버튼
    $('#confirm-ok').addEventListener('click', () => {
      const need = $('#confirm-input').dataset.need;
      if (need && $('#confirm-input').value.trim() !== need) {
        $('#confirm-input').focus();
        $('#confirm-hint').textContent = `"${need}"를 정확히 입력해 주세요.`;
        return;
      }
      $('#dlg-confirm').returnValue = 'ok';
      $('#dlg-confirm').close();
    });
    $('#confirm-cancel').addEventListener('click', () => $('#dlg-confirm').close());

    // 사이드바
    $('#btn-menu').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
    $$('.side-nav a[data-nav]').forEach(a => a.addEventListener('click', e => {
      const nav = a.dataset.nav;
      if (['all', 'owned', 'wishlist', 'sold'].includes(nav)) {
        e.preventDefault();
        filter = { status: nav, artist: null };
        $('#search').value = '';
        go('#/');
      }
    }));
    ['#side-artists', '#artist-list'].forEach(sel => $(sel).addEventListener('click', e => {
      const b = e.target.closest('button[data-artist]');
      if (!b) return;
      filter = { status: 'all', artist: b.dataset.artist };
      $('#search').value = '';
      go('#/');
    }));
    $('#status-chips').addEventListener('click', e => {
      const b = e.target.closest('button[data-status]');
      if (!b) return;
      filter = { status: b.dataset.status, artist: null };
      renderList();
      updateNavActive('list');
    });

    // 화면 모드 (자동 / PC / 모바일)
    $('#view-pref').addEventListener('click', e => {
      const b = e.target.closest('button[data-pref]');
      if (!b) return;
      Device.setPref(b.dataset.pref);
      renderViewPref();
    });
    window.addEventListener('viewchange', () => {
      document.body.classList.remove('nav-open');
      if ($('#page-settings').classList.contains('active')) renderViewPref();
    });

    // 목록
    $('#search').addEventListener('input', renderList);
    $('#sort').addEventListener('change', () => { prefs.sort = $('#sort').value; savePrefs(); renderList(); });
    $('#view-grid').addEventListener('click', () => setLayout('grid'));
    $('#view-list').addEventListener('click', () => setLayout('list'));

    // 앨범 폼
    $('#album-form').addEventListener('submit', onAlbumSubmit);
    $('#f-barcode').addEventListener('input', onBarcodeInput);
    $('#f-barcode').addEventListener('blur', e => { e.target.value = Util.formatBarcode(e.target.value); });
    $('#f-barcode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doLookup(); } });
    $('#btn-lookup').addEventListener('click', doLookup);
    $('#btn-scan').addEventListener('click', openScanner);
    $('#btn-form-add-disc').addEventListener('click', () => {
      $('#form-discs').appendChild(discEditor({}, $$('#form-discs .disc-editor').length + 1, true));
    });
    $('#form-discs').addEventListener('click', async e => {
      if (!e.target.closest('.rm-disc')) return;
      const el = e.target.closest('.disc-editor');
      const d = readDiscEditor(el);
      // 아무것도 적지 않은 CD는 바로 지우고, 내용이 있으면 확인
      if ((d.matrix || d.mastering || d.mould || d.tracklist || d.notes || d.title) &&
        !await ask({ title: `${$('.d-no', el).textContent}을(를) 뺄까요?`, message: '저장을 눌러야 최종 반영됩니다.', ok: '빼기', danger: true })) return;
      el.remove();
      renumberEditors();
    });
    $('#f-cover-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try { setCover(await Util.resizeImage(file)); } catch (err) { toast(err.message); }
    });
    $('#btn-cover-clear').addEventListener('click', () => setCover(null));
    $('#album-form').elements.releaseDate.addEventListener('change', updateYearOnly);
    $('#dlg-scan').addEventListener('close', () => Scanner.stop($('#scan-video')));

    // CD 폼
    $('#disc-form').addEventListener('submit', onDiscSubmit);
    $('#btn-disc-delete').addEventListener('click', () => deleteDisc(discTarget.albumId, discTarget.discId));

    // 백업
    $('#btn-export-json').addEventListener('click', exportJSON);
    $('#btn-export-csv').addEventListener('click', exportCSV);
    $('#import-json').addEventListener('change', importJSON);
    $('#btn-clear').addEventListener('click', clearAll);
  }

  function setLayout(layout, persist = true) {
    $('#album-container').className = layout;
    $('#view-grid').classList.toggle('active', layout === 'grid');
    $('#view-list').classList.toggle('active', layout === 'list');
    if (persist) { prefs.layout = layout; savePrefs(); }
  }

  // ---------- 공통 렌더 ----------
  function renderShell() {
    const st = s => albums.filter(a => (a.status || 'owned') === s).length;
    $('#cnt-all').textContent = albums.length || '';
    $('#cnt-owned').textContent = st('owned') || '';
    $('#cnt-wishlist').textContent = st('wishlist') || '';
    $('#cnt-sold').textContent = st('sold') || '';

    const counts = new Map();
    albums.forEach(a => counts.set(a.artist, (counts.get(a.artist) || 0) + 1));
    const artists = [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'ko'));
    $('#side-artists').innerHTML = artists.length
      ? artists.map(([name, n]) => `<button data-artist="${esc(name)}"><span>${esc(name)}</span><span class="count">${n}</span></button>`).join('')
      : '<p class="muted small" style="margin:0 10px;font-size:.82rem">아직 없음</p>';

    const discCount = albums.filter(a => (a.status || 'owned') === 'owned').reduce((s, a) => s + a.discs.length, 0);
    $('#side-foot').textContent = albums.length ? `앨범 ${albums.length}장 · 보유 디스크 ${discCount}장` : '';

    renderDatalists();
    updateNavActive();
  }

  function updateNavActive(page) {
    page = page || ($('.page.active') || {}).id?.replace('page-', '');
    $$('.side-nav a[data-nav]').forEach(a => {
      const nav = a.dataset.nav;
      let on = false;
      if (page === 'list') on = !filter.artist && nav === filter.status;
      else on = nav === page;
      a.classList.toggle('active', on);
    });
    $$('#side-artists button').forEach(b => b.classList.toggle('active', page === 'list' && b.dataset.artist === filter.artist));
    $$('#status-chips button').forEach(b => b.classList.toggle('active', !filter.artist && b.dataset.status === filter.status));
    // 하단 탭바: 앨범 상세는 컬렉션 탭, 아티스트로 거른 목록은 기록 탭
    const tab = page === 'album' ? 'list' : page === 'list' && filter.artist ? 'artists' : page;
    $$('.tabbar [data-tab]').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
  }

  function renderDatalists() {
    const fill = (id, key) => {
      const vals = [...new Set(albums.map(a => a[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
      $('#' + id).innerHTML = vals.map(v => `<option value="${esc(v)}">`).join('');
    };
    fill('dl-artists', 'artist');
    fill('dl-labels', 'label');
    fill('dl-locations', 'location');
    fill('dl-places', 'purchasePlace');
  }

  function coverHTML(a) {
    return a.cover
      ? `<img class="cover" src="${a.cover}" alt="${esc(a.title)} 표지" loading="lazy">`
      : `<div class="cover placeholder"><span>${esc(a.title)}</span></div>`;
  }

  function stars(n) {
    n = Number(n) || 0;
    return n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
  }

  // 디스크 구성 요약: [CD] → "CD", [CD,CD] → "2CD", [CD,DVD] → "CD+DVD"
  function discSummary(discs) {
    if (!discs.length) return '';
    const groups = [];
    discs.forEach(d => {
      const last = groups[groups.length - 1];
      if (last && last.type === d.type) last.n++; else groups.push({ type: d.type || 'CD', n: 1 });
    });
    return groups.map(g => (g.n > 1 ? g.n : '') + g.type).join('+');
  }

  // ---------- 목록 ----------
  function searchText(a) {
    const discs = a.discs.map(d => [d.title, d.matrix, d.mastering, d.mould, d.tracklist].join(' ')).join(' ');
    return [a.title, a.artist, a.label, a.catalogNo, a.barcode, a.country, a.edition, a.location,
      (a.tags || []).join(' '), a.notes, discs].join(' ').toLowerCase();
  }

  function filtered() {
    const q = $('#search').value.trim().toLowerCase();
    const compact = s => s.replace(/[\s\-_./]+/g, '');
    const qCompact = compact(q);
    const list = albums.filter(a => {
      if (filter.status !== 'all' && (a.status || 'owned') !== filter.status) return false;
      if (filter.artist && a.artist !== filter.artist) return false;
      if (!q) return true;
      const text = searchText(a);
      // 매트릭스는 띄어쓰기·하이픈이 제각각이라 이를 무시하고도 비교
      return text.includes(q) || (qCompact && compact(text).includes(qCompact));
    });
    const cmp = (x, y) => String(x || '').localeCompare(String(y || ''), 'ko');
    const sorters = {
      'added-desc': (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
      'artist-asc': (a, b) => cmp(a.artist, b.artist) || cmp(a.releaseDate || a.year, b.releaseDate || b.year) || cmp(a.title, b.title),
      'title-asc': (a, b) => cmp(a.title, b.title),
      'year-desc': (a, b) => cmp(b.releaseDate || String(b.year || ''), a.releaseDate || String(a.year || '')),
      'year-asc': (a, b) => cmp(a.releaseDate || String(a.year || '9999'), b.releaseDate || String(b.year || '9999')),
      'rating-desc': (a, b) => (b.rating || 0) - (a.rating || 0),
    };
    return list.sort(sorters[$('#sort').value] || sorters['added-desc']);
  }

  function renderList() {
    const title = filter.artist || (filter.status === 'all' ? '전체 앨범' : STATUS_LABEL[filter.status]);
    $('#list-title').textContent = title;

    const container = $('#album-container');
    if (!loaded) {
      $('#empty').classList.add('hidden');
      $('.toolbar').classList.add('hidden');
      container.classList.remove('hidden');
      container.innerHTML = '<p class="muted no-result">불러오는 중…</p>';
      return;
    }
    $('#empty-login').classList.toggle('hidden', !!user || !Cloud.available);
    const list = filtered();
    const empty = albums.length === 0;
    $('#empty').classList.toggle('hidden', !empty);
    container.classList.toggle('hidden', empty);
    $('.toolbar').classList.toggle('hidden', empty);
    $('#result-count').textContent = empty ? '' : `${list.length}장`;

    if (!empty && !list.length) {
      container.innerHTML = '<p class="muted no-result">해당하는 앨범이 없습니다.</p>';
      return;
    }
    container.innerHTML = list.map(a => {
      const status = a.status && a.status !== 'owned' ? `<span class="badge ${a.status}">${STATUS_LABEL[a.status]}</span>` : '';
      const meta = [yearOf(a) || '', discSummary(a.discs), a.label].filter(Boolean).map(esc).join(' · ');
      const firstMatrix = (a.discs.find(d => d.matrix) || {}).matrix;
      return `
        <a class="album" href="#/album/${encodeURIComponent(a.id)}">
          ${coverHTML(a)}
          <div class="info">
            <div class="title">${esc(a.title)}${status}</div>
            <div class="artist">${esc(a.artist)}</div>
            <div class="meta">${meta}</div>
            <div class="codes">
              ${a.barcode ? `<span>${esc(Util.formatBarcode(a.barcode))}</span>` : ''}
              ${firstMatrix ? `<span>${esc(firstMatrix)}</span>` : ''}
            </div>
            ${a.rating ? `<div class="stars">${stars(a.rating)}</div>` : ''}
          </div>
        </a>`;
    }).join('');
  }

  // ---------- 앨범 상세 ----------
  function renderAlbumPage(id) {
    const page = $('#page-album');
    const a = albums.find(x => x.id === id);
    if (!a) {
      page.innerHTML = '<a href="#/" class="back">← 목록으로</a><p class="muted">앨범을 찾을 수 없습니다.</p>';
      return;
    }
    const row = (label, val) => val ? `<dt>${label}</dt><dd>${val}</dd>` : '';
    const discCards = a.discs.map((d, i) => {
      const code = (label, v) => `<tr><th>${label}</th><td class="${v ? '' : 'none'}">${v ? esc(v) : '—'}</td></tr>`;
      return `
        <article class="disc-card">
          <div class="disc-card-head">
            <div>
              <span class="disc-no">Disc ${i + 1}</span><span class="disc-type">${esc(d.type || 'CD')}</span>
              ${d.title ? `<p class="disc-sub">${esc(d.title)}</p>` : ''}
            </div>
            <div class="disc-actions">
              <button class="btn small" data-edit-disc="${d.id}">수정</button>
              <button class="btn small danger" data-del-disc="${d.id}">삭제</button>
            </div>
          </div>
          <table class="codes-table">
            ${code('매트릭스', d.matrix)}
            ${code('Mastering SID', d.mastering)}
            ${code('Mould SID', d.mould)}
          </table>
          ${d.notes ? `<p class="disc-sub" style="margin-top:10px">${esc(d.notes)}</p>` : ''}
          ${d.tracklist ? `<details><summary>트랙리스트 (${d.tracklist.split('\n').filter(Boolean).length})</summary><pre class="tracklist">${esc(d.tracklist)}</pre></details>` : ''}
        </article>`;
    }).join('');

    page.innerHTML = `
      <a href="#/" class="back">← 목록으로</a>
      <div class="album-hero">
        ${coverHTML(a)}
        <div>
          <h1>${esc(a.title)}</h1>
          <p class="hero-artist">${esc(a.artist)}</p>
          ${a.rating ? `<div class="stars">${stars(a.rating)}</div>` : ''}
          <dl class="kv">
            ${row('바코드', a.barcode ? `<span class="mono">${esc(Util.formatBarcode(a.barcode))}</span>` : '')}
            ${row('카탈로그', a.catalogNo ? `<span class="mono">${esc(a.catalogNo)}</span>` : '')}
            ${row('레이블', esc(a.label))}
            ${row('발매', esc([releaseText(a), a.country].filter(Boolean).join(' · ')))}
            ${row('구성', esc(discSummary(a.discs)))}
            ${row('에디션', esc(a.edition))}
            ${row('상태', esc([STATUS_LABEL[a.status || 'owned'], a.mediaCondition && '디스크 ' + a.mediaCondition, a.sleeveCondition && '케이스 ' + a.sleeveCondition].filter(Boolean).join(' · ')))}
            ${row('보관 위치', esc(a.location))}
            ${row('구입', esc([a.purchaseDate, a.purchasePlace, a.price ? Util.won(a.price) : ''].filter(Boolean).join(' · ')))}
            ${row('태그', (a.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(''))}
            ${row('MusicBrainz', a.musicbrainzId ? `<a href="https://musicbrainz.org/release/${esc(a.musicbrainzId)}" target="_blank" rel="noopener">릴리스 보기 ↗</a>` : '')}
          </dl>
          <div class="hero-actions">
            <button class="btn primary" id="btn-edit-album">앨범 정보 수정</button>
            <button class="btn" id="btn-dup-album" title="같은 앨범의 다른 프레싱 등록">다른 프레싱 등록</button>
            <button class="btn danger" id="btn-del-album">삭제</button>
          </div>
        </div>
      </div>

      <section class="section">
        <div class="section-head">
          <h2>수록 CD<small>${a.discs.length}장</small></h2>
        </div>
        <div class="discs">
          ${discCards}
          <button class="disc-add" id="btn-add-disc"><b>＋</b>CD 추가</button>
        </div>
      </section>

      ${a.notes ? `<section class="section"><div class="section-head"><h2>메모</h2></div><p class="notes">${esc(a.notes)}</p></section>` : ''}

      <p class="foot-meta">등록 ${new Date(a.createdAt).toLocaleDateString('ko-KR')}${a.updatedAt && a.updatedAt !== a.createdAt ? ` · 수정 ${new Date(a.updatedAt).toLocaleDateString('ko-KR')}` : ''}</p>`;

    $('#btn-edit-album').onclick = () => openAlbumForm(a);
    $('#btn-del-album').onclick = () => deleteAlbum(a.id);
    $('#btn-dup-album').onclick = () => openAlbumForm({
      ...a, id: null, createdAt: null,
      discs: a.discs.map(d => ({ ...d, id: uid(), matrix: '', mastering: '', mould: '', notes: '' })),
      purchaseDate: Util.today(), purchasePlace: '', price: '', mediaCondition: '', sleeveCondition: '',
    }, true);
    $('#btn-add-disc').onclick = () => openDiscForm(a.id, null);
    $$('[data-edit-disc]', page).forEach(b => { b.onclick = () => openDiscForm(a.id, b.dataset.editDisc); });
    $$('[data-del-disc]', page).forEach(b => { b.onclick = () => deleteDisc(a.id, b.dataset.delDisc); });
  }

  // ---------- CD 편집기 (앨범 폼 / CD 폼 공용) ----------
  function discEditor(d, no, removable) {
    const el = document.createElement('div');
    el.className = 'disc-editor';
    el.dataset.discId = d.id || uid();
    el.innerHTML = `
      <div class="disc-editor-head">
        <strong class="d-no">Disc ${no}</strong>
        <span class="spacer"></span>
        ${removable ? '<button type="button" class="link-btn rm-disc">삭제</button>' : ''}
      </div>
      <div class="disc-grid">
        <label>종류
          <select class="d-type">${DISC_TYPES.map(t => `<option${t === (d.type || 'CD') ? ' selected' : ''}>${t}</option>`).join('')}</select>
        </label>
        <label>디스크 부제<input class="d-title" placeholder="예: Bonus Disc" value="${esc(d.title || '')}"></label>
        <label class="full">매트릭스 / 런아웃<input class="d-matrix mono" placeholder="예: SRCL-1234 1A1" value="${esc(d.matrix || '')}"></label>
        <div class="sids">
          <label>Mastering SID<input class="d-mastering mono" placeholder="IFPI L…" value="${esc(d.mastering || '')}"></label>
          <label>Mould SID<input class="d-mould mono" placeholder="IFPI …" value="${esc(d.mould || '')}"></label>
        </div>
      </div>
      <details${d.tracklist || d.notes ? ' open' : ''}>
        <summary>트랙리스트 · 메모</summary>
        <div class="disc-grid" style="margin-top:8px">
          <label class="full">트랙리스트 (한 줄에 한 곡)<textarea class="d-tracklist" rows="5">${esc(d.tracklist || '')}</textarea></label>
          <label class="full">메모<input class="d-notes" placeholder="디스크 관련 특이사항" value="${esc(d.notes || '')}"></label>
        </div>
      </details>`;
    return el;
  }

  function readDiscEditor(el) {
    const v = sel => $(sel, el).value.trim();
    return {
      id: el.dataset.discId, type: v('.d-type'), title: v('.d-title'),
      matrix: v('.d-matrix'), mastering: v('.d-mastering'), mould: v('.d-mould'),
      tracklist: v('.d-tracklist'), notes: v('.d-notes'),
    };
  }

  function renumberEditors() {
    $$('#form-discs .disc-editor').forEach((el, i) => { $('.d-no', el).textContent = `Disc ${i + 1}`; });
  }

  // ---------- 앨범 폼 ----------
  function openAlbumForm(album = null, asNew = false) {
    const form = $('#album-form');
    form.reset();
    editingAlbumId = album && !asNew ? album.id : null;
    $('#album-form-title').textContent = editingAlbumId ? '앨범 정보 수정' : asNew ? '다른 프레싱 등록' : '앨범 등록';
    $('#lookup-results').innerHTML = '';

    const a = album || { status: 'owned', purchaseDate: Util.today(), discs: [] };
    for (const el of form.elements) {
      if (!el.name || el.type === 'file') continue;
      let v = el.name === 'tags' ? (a.tags || []).join(', ') : a[el.name];
      if (v !== undefined && v !== null) el.value = v;
    }
    $('#f-barcode').value = Util.formatBarcode(a.barcode || '');
    updateYearOnly();
    const discs = a.discs && a.discs.length ? a.discs : [{}];
    $('#form-discs').innerHTML = '';
    discs.forEach((d, i) => $('#form-discs').appendChild(discEditor(d, i + 1, true)));
    setCover(a.cover || null);
    updateBarcodeHint();
    $('#dlg-album').showModal();
    $('#dlg-album').scrollTop = 0;
  }

  // 발매일 없이 연도만 알고 있을 때 안내 (날짜를 고르면 사라짐)
  function updateYearOnly() {
    const form = $('#album-form');
    const year = form.elements.year.value;
    $('#year-only').textContent = !form.elements.releaseDate.value && year ? `연도만 저장됨: ${year}` : '';
  }

  function setCover(dataUrl) {
    formCover = dataUrl;
    const p = $('#cover-preview');
    p.classList.toggle('has', !!dataUrl);
    p.innerHTML = dataUrl ? `<img src="${dataUrl}" alt="표지">` : '<span>＋ 표지 등록</span>';
    $('#btn-cover-clear').classList.toggle('hidden', !dataUrl);
  }

  // 입력하면서 자동으로 띄어쓰기를 넣되, 커서 위치는 유지
  function onBarcodeInput(e) {
    const el = e.target;
    const digitsBefore = Util.normalizeBarcode(el.value.slice(0, el.selectionStart)).length;
    el.value = Util.groupBarcodeTyping(el.value);
    let pos = 0, seen = 0;
    while (pos < el.value.length && seen < digitsBefore) { if (/\d/.test(el.value[pos])) seen++; pos++; }
    el.setSelectionRange(pos, pos);
    updateBarcodeHint();
  }

  function updateBarcodeHint() {
    const code = Util.normalizeBarcode($('#f-barcode').value);
    const hint = $('#barcode-hint');
    hint.className = 'hint';
    if (!code) { hint.textContent = ''; return; }
    const parts = [];
    if (Util.validateBarcode(code) === false) parts.push('체크 디지트가 맞지 않습니다. 번호를 확인해 주세요.');
    const dups = albums.filter(a => a.barcode === code && a.id !== editingAlbumId);
    if (dups.length) {
      parts.push(`같은 바코드로 이미 ${dups.length}건 등록됨 — ` + dups.map(d => {
        const mx = d.discs.map(x => x.matrix).filter(Boolean);
        return `${d.title}${mx.length ? ` [${mx.join(', ')}]` : ''}`;
      }).join(' / ') + '. 다른 프레싱이라면 매트릭스로 구분하세요.');
    }
    if (parts.length) hint.classList.add('warn');
    hint.textContent = parts.join(' ');
  }

  async function doLookup() {
    const code = Util.normalizeBarcode($('#f-barcode').value);
    const box = $('#lookup-results');
    if (!code) { toast('바코드를 먼저 입력하세요'); return; }
    box.innerHTML = '<p class="muted">MusicBrainz에서 검색 중…</p>';
    try {
      const results = await Lookup.byBarcode(code);
      if (!results.length) {
        box.innerHTML = '<p class="muted">검색 결과가 없습니다. 정보를 직접 입력해 주세요.</p>';
        return;
      }
      box.innerHTML = '<p class="muted">맞는 항목을 선택하면 아래 정보가 채워집니다.</p>' + results.map((r, i) => `
        <button type="button" class="lookup-item" data-i="${i}">
          <strong>${esc(r.artist)} — ${esc(r.title)}</strong>
          <span>${esc([r.date, r.country, r.label, r.catalogNo, r.format].filter(Boolean).join(' · '))}</span>
        </button>`).join('');
      $$('.lookup-item', box).forEach(btn => btn.addEventListener('click', () => applyLookup(results[+btn.dataset.i])));
    } catch (err) {
      box.innerHTML = `<p class="muted">검색 실패: ${esc(err.message)}</p>`;
    }
  }

  async function applyLookup(r) {
    const form = $('#album-form');
    const set = (name, val) => { if (val !== '' && val != null) form.elements[name].value = val; };
    set('title', r.title);
    set('artist', r.artist);
    set('label', r.label);
    set('catalogNo', r.catalogNo);
    // MusicBrainz 날짜가 연도·연월만 있는 경우 날짜칸은 비우고 연도만 보관
    if (/^\d{4}-\d{2}-\d{2}$/.test(r.date)) { set('releaseDate', r.date); form.elements.year.value = ''; }
    else { form.elements.releaseDate.value = ''; set('year', r.year); }
    set('country', r.country);
    set('musicbrainzId', r.musicbrainzId);
    $('#lookup-results').innerHTML = '<p class="muted">수록 CD와 표지를 가져오는 중…</p>';

    const [det, blob] = await Promise.all([
      Lookup.details(r.musicbrainzId).catch(() => null),
      formCover ? Promise.resolve(null) : Lookup.coverBlob(r.musicbrainzId),
    ]);
    if (det && det.discs.length) {
      det.discs.forEach((md, i) => {
        let el = $$('#form-discs .disc-editor')[i];
        if (!el) { el = discEditor({}, i + 1, true); $('#form-discs').appendChild(el); }
        $('.d-type', el).value = md.type;
        if (md.title && !$('.d-title', el).value) $('.d-title', el).value = md.title;
        if (md.tracklist && !$('.d-tracklist', el).value) $('.d-tracklist', el).value = md.tracklist;
      });
    }
    if (blob) { try { setCover(await Util.resizeImage(blob)); } catch { /* 표지 없음 */ } }
    updateYearOnly();
    $('#lookup-results').innerHTML = '<p class="muted">✓ 정보를 불러왔습니다. 매트릭스는 디스크를 보고 직접 입력해 주세요.</p>';
  }

  async function onAlbumSubmit(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const str = k => (fd.get(k) || '').toString().trim();
    const num = k => { const v = str(k); return v === '' ? '' : Number(v); };
    const title = str('title');
    const artist = str('artist');
    if (!title || !artist) { toast('앨범 제목과 아티스트는 필수입니다'); return; }

    const existing = editingAlbumId ? albums.find(a => a.id === editingAlbumId) : null;
    const now = Date.now();
    const album = {
      ...(existing || {}),
      id: editingAlbumId || uid(),
      title, artist,
      barcode: Util.normalizeBarcode(str('barcode')),
      label: str('label'),
      catalogNo: str('catalogNo'),
      releaseDate: str('releaseDate'),
      year: str('releaseDate') ? Number(str('releaseDate').slice(0, 4)) : num('year'),
      country: str('country').toUpperCase(),
      edition: str('edition'),
      discs: $$('#form-discs .disc-editor').map(readDiscEditor),
      status: str('status') || 'owned',
      mediaCondition: str('mediaCondition'),
      sleeveCondition: str('sleeveCondition'),
      location: str('location'),
      purchaseDate: str('purchaseDate'),
      purchasePlace: str('purchasePlace'),
      price: num('price'),
      rating: Number(fd.get('rating')) || 0,
      tags: str('tags').split(',').map(t => t.trim()).filter(Boolean),
      notes: str('notes'),
      musicbrainzId: str('musicbrainzId'),
      cover: formCover,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    await saveAlbum(album);
    $('#dlg-album').close();
    toast(existing ? '저장했습니다' : `「${album.title}」 등록 완료`);
    go('#/album/' + encodeURIComponent(album.id));
  }

  // 계정 저장소는 오프라인이면 서버 응답을 기다리지 않고 진행 (연결되면 자동 전송)
  function persist(promise) {
    const handled = promise.catch(err => toast('저장 실패: ' + err.message));
    return user ? Promise.resolve() : handled;
  }

  async function saveAlbum(album) {
    const idx = albums.findIndex(a => a.id === album.id);
    if (idx >= 0) albums[idx] = album; else albums.push(album);
    renderShell();
    await persist(store.put(album));
  }

  async function deleteAlbum(id) {
    const a = albums.find(x => x.id === id);
    if (!a) return;
    if (!await ask({
      title: '앨범을 삭제할까요?',
      message: `「${a.title}」 — ${a.artist}\n수록 CD ${a.discs.length}장의 정보도 함께 삭제되며 되돌릴 수 없습니다.`,
      ok: '삭제', danger: true,
    })) return;
    persist(store.remove(id));
    albums = albums.filter(x => x.id !== id);
    renderShell();
    toast('삭제했습니다');
    go('#/');
  }

  // ---------- CD 폼 ----------
  function openDiscForm(albumId, discId) {
    const a = albums.find(x => x.id === albumId);
    if (!a) return;
    discTarget = { albumId, discId };
    const idx = discId ? a.discs.findIndex(d => d.id === discId) : a.discs.length;
    const disc = discId ? a.discs[idx] : {};
    $('#disc-form-title').textContent = discId ? `Disc ${idx + 1} 수정` : `Disc ${idx + 1} 추가`;
    $('#btn-disc-delete').classList.toggle('hidden', !discId);
    const body = $('#disc-form-body');
    body.className = 'dlg-body disc-form-single';
    body.innerHTML = '';
    body.appendChild(discEditor(disc, idx + 1, false));
    $('details', body).open = true;
    $('#dlg-disc').showModal();
  }

  async function onDiscSubmit(e) {
    e.preventDefault();
    const a = albums.find(x => x.id === discTarget.albumId);
    if (!a) return;
    const disc = readDiscEditor($('#disc-form-body .disc-editor'));
    const discs = [...a.discs];
    const idx = discs.findIndex(d => d.id === disc.id);
    if (idx >= 0) discs[idx] = disc; else discs.push(disc);
    await saveAlbum({ ...a, discs, updatedAt: Date.now() });
    $('#dlg-disc').close();
    toast(idx >= 0 ? 'CD 정보를 저장했습니다' : `Disc ${discs.length} 추가 완료`);
    route();
  }

  async function deleteDisc(albumId, discId) {
    const a = albums.find(x => x.id === albumId);
    if (!a || !discId) return;
    const idx = a.discs.findIndex(d => d.id === discId);
    const d = a.discs[idx];
    if (!await ask({
      title: `Disc ${idx + 1}을(를) 삭제할까요?`,
      message: `「${a.title}」의 Disc ${idx + 1}${d.matrix ? ` (매트릭스 ${d.matrix})` : ''} 정보가 삭제되며 되돌릴 수 없습니다.`,
      ok: '삭제', danger: true,
    })) return;
    await saveAlbum({ ...a, discs: a.discs.filter(x => x.id !== discId), updatedAt: Date.now() });
    $('#dlg-disc').close();
    toast(`Disc ${idx + 1}을(를) 삭제했습니다`);
    refresh();
  }

  // 사이트 자체 확인 팝업 (브라우저 기본 확인창은 Safari 등에서 차단될 수 있어 사용하지 않음)
  // typeToConfirm: 입력해야 진행되는 단어 (예: '삭제')
  function ask({ title, message = '', ok = '확인', danger = false, typeToConfirm = '' }) {
    const dlg = $('#dlg-confirm');
    $('#confirm-title').textContent = title;
    $('#confirm-msg').textContent = message;
    const okBtn = $('#confirm-ok');
    okBtn.textContent = ok;
    okBtn.className = 'btn ' + (danger ? 'danger-solid' : 'primary');
    const input = $('#confirm-input');
    input.value = '';
    input.dataset.need = typeToConfirm;
    input.placeholder = typeToConfirm;
    $('#confirm-field').classList.toggle('hidden', !typeToConfirm);
    $('#confirm-need').textContent = typeToConfirm;
    $('#confirm-hint').textContent = '';
    dlg.returnValue = '';
    return new Promise(resolve => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
      dlg.showModal();
      (typeToConfirm ? input : $('#confirm-cancel')).focus();
    });
  }

  // ---------- 스캐너 ----------
  async function openScanner() {
    const dlg = $('#dlg-scan');
    const status = $('#scan-status');
    status.textContent = '카메라를 여는 중…';
    dlg.showModal();
    try {
      await Scanner.start($('#scan-video'), code => {
        dlg.close();
        $('#f-barcode').value = Util.formatBarcode(code);
        updateBarcodeHint();
        toast('바코드 인식: ' + code);
        doLookup();
      }, msg => { status.textContent = msg; });
    } catch (err) {
      status.textContent = err.name === 'NotAllowedError' ? '카메라 권한이 거부되었습니다. 브라우저 설정에서 허용해 주세요.' : err.message;
    }
  }

  // ---------- 통계 ----------
  function renderStats() {
    const owned = albums.filter(a => (a.status || 'owned') === 'owned');
    const ownedDiscs = owned.flatMap(a => a.discs);
    const spent = owned.reduce((s, a) => s + (Number(a.price) || 0), 0);
    const withMatrix = ownedDiscs.filter(d => d.matrix).length;

    const countBy = (list, fn) => {
      const m = new Map();
      list.forEach(x => { const k = fn(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].sort((x, y) => y[1] - x[1]);
    };
    const bars = (title, entries, limit = 10) => {
      const top = entries.slice(0, limit);
      const max = Math.max(1, ...top.map(e => e[1]));
      return `<div class="panel"><h3>${title}</h3>${top.length ? top.map(([k, v]) => `
        <div class="bar-row"><span class="bar-label" title="${esc(k)}">${esc(k)}</span>
          <span class="bar"><span style="width:${(v / max) * 100}%"></span></span><span class="bar-val">${v}</span></div>`).join('')
        : '<p class="muted">데이터 없음</p>'}</div>`;
    };
    const decades = countBy(owned, a => yearOf(a) ? Math.floor(yearOf(a) / 10) * 10 + '년대' : '')
      .sort((x, y) => parseInt(x[0]) - parseInt(y[0]));

    $('#stats').innerHTML = `
      <div class="stat-tiles">
        <div class="tile"><b>${owned.length}</b><span>보유 앨범</span></div>
        <div class="tile"><b>${ownedDiscs.length}</b><span>보유 디스크</span></div>
        <div class="tile"><b>${new Set(owned.map(a => a.artist)).size}</b><span>아티스트</span></div>
        <div class="tile"><b>${withMatrix}<small style="font-size:.9rem;color:var(--muted)"> / ${ownedDiscs.length}</small></b><span>매트릭스 기록</span></div>
        <div class="tile"><b>${Util.won(spent)}</b><span>총 구입액</span></div>
        <div class="tile"><b>${albums.filter(a => a.status === 'wishlist').length}</b><span>위시리스트</span></div>
      </div>
      <div class="stat-grid">
        ${bars('아티스트', countBy(owned, a => a.artist))}
        ${bars('연대별', decades, 20)}
        ${bars('디스크 종류', countBy(ownedDiscs, d => d.type))}
        ${bars('레이블', countBy(owned, a => a.label))}
        ${bars('발매국가', countBy(owned, a => a.country))}
        ${bars('보관 위치', countBy(owned, a => a.location))}
      </div>`;
  }

  // ---------- 백업 ----------
  function exportJSON() {
    const data = { app: 'matrixandbarcode', version: 2, exportedAt: new Date().toISOString(), albums };
    Util.download(`cd-collection-${Util.today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  function exportCSV() {
    const head = ['아티스트', '앨범', '바코드', '카탈로그번호', '레이블', '발매일', '국가', '구성', '에디션',
      '매트릭스', 'Mastering SID', 'Mould SID', '상태', '디스크상태', '케이스상태', '보관위치', '구입일', '구입처', '구입가', '평점', '태그', '메모'];
    const perDisc = (a, key) => a.discs.map((d, i) => d[key] ? `D${i + 1}: ${d[key]}` : '').filter(Boolean).join(' / ');
    const rows = albums.map(a => [a.artist, a.title, a.barcode, a.catalogNo, a.label, releaseText(a), a.country, discSummary(a.discs), a.edition,
      perDisc(a, 'matrix'), perDisc(a, 'mastering'), perDisc(a, 'mould'),
      STATUS_LABEL[a.status || 'owned'], a.mediaCondition, a.sleeveCondition, a.location, a.purchaseDate, a.purchasePlace,
      a.price, a.rating || '', (a.tags || []).join(', '), a.notes]);
    // BOM을 붙여 엑셀에서 한글이 깨지지 않도록
    Util.download(`cd-collection-${Util.today()}.csv`, '﻿' + Util.toCSV([head, ...rows]), 'text/csv;charset=utf-8');
  }

  async function importJSON(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data.albums;
      if (!Array.isArray(list)) throw new Error('올바른 백업 파일이 아닙니다');
      const valid = list.filter(a => a && a.title && a.artist)
        .map(a => normalize({ ...a, id: a.id || uid(), createdAt: a.createdAt || Date.now() }));
      if (!await ask({ title: `앨범 ${valid.length}개를 불러올까요?`, message: '같은 앨범이 이미 있으면 백업 파일 내용으로 덮어씁니다.', ok: '불러오기' })) return;
      await store.putMany(valid);
      albums = (await store.all()).map(normalize);
      renderShell();
      route();
      toast(`${valid.length}건을 불러왔습니다`);
    } catch (err) {
      toast('불러오기 실패: ' + err.message);
    }
  }

  async function clearAll() {
    if (!albums.length) return;
    if (!await ask({
      title: '모든 앨범을 삭제할까요?',
      message: `앨범 ${albums.length}개와 수록 CD 정보가 모두 삭제되며 되돌릴 수 없습니다.${user ? ' 계정에 저장된 데이터도 삭제됩니다.' : ''}`,
      ok: '전체 삭제', danger: true, typeToConfirm: '삭제',
    })) return;
    await store.clear();
    albums = [];
    renderShell();
    toast('모든 데이터를 삭제했습니다');
  }

  // ---------- 토스트 ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  init().catch(err => {
    console.error(err);
    $('#page-list').insertAdjacentHTML('afterbegin', `<div class="panel"><h2>저장소를 열 수 없습니다</h2><p>${esc(err.message)}</p><p class="muted">사파리 개인정보 보호 브라우징에서는 저장이 제한될 수 있습니다.</p></div>`);
  });

  // 예기치 못한 오류를 화면에 알려 원인을 파악할 수 있게 함
  window.addEventListener('error', e => toast('오류: ' + (e.message || '알 수 없는 오류')));
  window.addEventListener('unhandledrejection', e => toast('오류: ' + ((e.reason && e.reason.message) || e.reason)));
})();
