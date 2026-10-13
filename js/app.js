(() => {
  const { esc, uid } = Util;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const STATUS_LABEL = { owned: '보유', wishlist: '위시리스트', sold: '처분함' };
  const PREF_KEY = 'mab-prefs';

  let albums = [];
  let editingId = null;
  let formCover = null; // data URL
  let prefs = loadPrefs();

  // ---------- 초기화 ----------
  async function init() {
    albums = await DB.all();
    applyPrefs();
    bindEvents();
    render();
  }

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
  }
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* 무시 */ }
  }
  function applyPrefs() {
    if (prefs.sort) $('#sort').value = prefs.sort;
    setLayout(prefs.layout || 'grid', false);
  }

  // ---------- 이벤트 ----------
  function bindEvents() {
    $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));
    $('#btn-add').addEventListener('click', () => openForm());
    document.addEventListener('click', e => {
      if (e.target.closest('[data-action="add"]')) openForm();
      const closer = e.target.closest('[data-close]');
      if (closer) closer.closest('dialog').close();
    });

    $('#search').addEventListener('input', renderCollection);
    $('#filter-format').addEventListener('change', renderCollection);
    $('#filter-status').addEventListener('change', renderCollection);
    $('#sort').addEventListener('change', () => { prefs.sort = $('#sort').value; savePrefs(); renderCollection(); });
    $('#view-grid').addEventListener('click', () => setLayout('grid'));
    $('#view-list').addEventListener('click', () => setLayout('list'));

    $('#album-container').addEventListener('click', e => {
      const card = e.target.closest('[data-id]');
      if (card) openDetail(card.dataset.id);
    });
    $('#album-container').addEventListener('keydown', e => {
      const card = e.target.closest('[data-id]');
      if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(card.dataset.id); }
    });

    // 폼
    $('#album-form').addEventListener('submit', onSubmit);
    $('#f-barcode').addEventListener('input', updateBarcodeHint);
    $('#f-barcode').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); doLookup(); }
    });
    $('#btn-lookup').addEventListener('click', doLookup);
    $('#btn-scan').addEventListener('click', openScanner);
    $('#btn-add-matrix').addEventListener('click', () => addMatrixRow());
    $('#matrix-list').addEventListener('click', e => {
      if (e.target.closest('.rm-matrix')) e.target.closest('.matrix-row').remove();
    });
    $('#f-cover-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try { setCover(await Util.resizeImage(file)); } catch (err) { toast(err.message); }
      e.target.value = '';
    });
    $('#btn-cover-clear').addEventListener('click', () => setCover(null));
    $('#btn-delete').addEventListener('click', () => editingId && deleteAlbum(editingId));
    $('#dlg-scan').addEventListener('close', () => Scanner.stop($('#scan-video')));

    // 백업
    $('#btn-export-json').addEventListener('click', exportJSON);
    $('#btn-export-csv').addEventListener('click', exportCSV);
    $('#import-json').addEventListener('change', importJSON);
    $('#btn-clear').addEventListener('click', clearAll);
  }

  function switchView(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'stats') renderStats();
  }

  function setLayout(layout, persist = true) {
    $('#album-container').className = layout;
    $('#view-grid').classList.toggle('active', layout === 'grid');
    $('#view-list').classList.toggle('active', layout === 'list');
    if (persist) { prefs.layout = layout; savePrefs(); }
  }

  // ---------- 렌더링 ----------
  function render() {
    renderFormatFilter();
    renderDatalists();
    renderCollection();
    if ($('#view-stats').classList.contains('active')) renderStats();
  }

  function renderFormatFilter() {
    const sel = $('#filter-format');
    const cur = sel.value;
    const formats = [...new Set(albums.map(a => a.format).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">모든 포맷</option>' + formats.map(f => `<option>${esc(f)}</option>`).join('');
    sel.value = formats.includes(cur) ? cur : '';
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

  function searchText(a) {
    const matrix = (a.matrix || []).map(m => [m.code, m.mastering, m.mould].join(' ')).join(' ');
    return [a.title, a.artist, a.label, a.catalogNo, a.barcode, a.country, a.edition, a.location,
      (a.tags || []).join(' '), a.notes, matrix].join(' ').toLowerCase();
  }

  function filtered() {
    const q = $('#search').value.trim().toLowerCase();
    const qCompact = q.replace(/\s+/g, '');
    const fmt = $('#filter-format').value;
    const st = $('#filter-status').value;
    const list = albums.filter(a => {
      if (fmt && a.format !== fmt) return false;
      if (st && (a.status || 'owned') !== st) return false;
      if (!q) return true;
      const text = searchText(a);
      // 매트릭스 번호는 공백 유무가 제각각이라 공백을 무시하고도 비교
      return text.includes(q) || text.replace(/\s+/g, '').includes(qCompact);
    });
    const cmp = (x, y) => String(x || '').localeCompare(String(y || ''), 'ko');
    const sorters = {
      'added-desc': (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
      'artist-asc': (a, b) => cmp(a.artist, b.artist) || (a.year || 0) - (b.year || 0) || cmp(a.title, b.title),
      'title-asc': (a, b) => cmp(a.title, b.title),
      'year-desc': (a, b) => (b.year || 0) - (a.year || 0),
      'year-asc': (a, b) => (a.year || 9999) - (b.year || 9999),
      'rating-desc': (a, b) => (b.rating || 0) - (a.rating || 0),
    };
    return list.sort(sorters[$('#sort').value] || sorters['added-desc']);
  }

  function coverHTML(a, cls = 'cover') {
    return a.cover
      ? `<img class="${cls}" src="${a.cover}" alt="" loading="lazy">`
      : `<div class="${cls} placeholder"><span class="disc" aria-hidden="true"></span></div>`;
  }

  function stars(n) {
    n = Number(n) || 0;
    return n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
  }

  function renderCollection() {
    const list = filtered();
    const container = $('#album-container');
    const empty = albums.length === 0;
    $('#empty').classList.toggle('hidden', !empty);
    container.classList.toggle('hidden', empty);
    $('#result-count').textContent = empty ? '' :
      (list.length === albums.length ? `총 ${albums.length}장` : `${list.length}장 / 총 ${albums.length}장`);

    if (!empty && list.length === 0) {
      container.innerHTML = '<p class="muted no-result">검색 결과가 없습니다.</p>';
      return;
    }

    container.innerHTML = list.map(a => {
      const status = a.status && a.status !== 'owned' ? `<span class="badge ${a.status}">${STATUS_LABEL[a.status]}</span>` : '';
      const meta = [a.year, a.format, a.label].filter(Boolean).map(esc).join(' · ');
      return `
        <article class="album" data-id="${a.id}" tabindex="0">
          ${coverHTML(a)}
          <div class="info">
            <div class="title">${esc(a.title)} ${status}</div>
            <div class="artist">${esc(a.artist)}</div>
            <div class="meta">${meta}</div>
            <div class="codes">
              ${a.barcode ? `<span title="바코드">▮▯▮ ${esc(a.barcode)}</span>` : ''}
              ${a.catalogNo ? `<span title="카탈로그 번호">${esc(a.catalogNo)}</span>` : ''}
              ${(a.matrix || []).length ? `<span title="매트릭스">◎ ${esc(a.matrix[0].code)}${a.matrix.length > 1 ? ` 외 ${a.matrix.length - 1}` : ''}</span>` : ''}
            </div>
            ${a.rating ? `<div class="stars">${stars(a.rating)}</div>` : ''}
          </div>
        </article>`;
    }).join('');
  }

  // ---------- 상세 ----------
  function openDetail(id) {
    const a = albums.find(x => x.id === id);
    if (!a) return;
    const row = (label, val) => val ? `<dt>${label}</dt><dd>${val}</dd>` : '';
    const matrixRows = (a.matrix || []).map(m => `
      <tr><td>${esc(m.disc || '')}</td><td class="mono">${esc(m.code)}</td><td class="mono">${esc(m.mastering || '')}</td><td class="mono">${esc(m.mould || '')}</td></tr>`).join('');
    const tracks = (a.tracklist || '').trim();

    $('#detail-body').innerHTML = `
      <header class="dlg-head">
        <h2>${esc(a.title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="닫기">✕</button>
      </header>
      <div class="detail">
        <div class="detail-cover">${coverHTML(a, 'cover large')}</div>
        <div>
          <p class="detail-artist">${esc(a.artist)}</p>
          ${a.rating ? `<p class="stars">${stars(a.rating)}</p>` : ''}
          <dl class="kv">
            ${row('상태', esc(STATUS_LABEL[a.status || 'owned']))}
            ${row('바코드', a.barcode ? `<span class="mono">${esc(a.barcode)}</span>` : '')}
            ${row('카탈로그', a.catalogNo ? `<span class="mono">${esc(a.catalogNo)}</span>` : '')}
            ${row('레이블', esc(a.label))}
            ${row('발매', esc([a.year, a.country].filter(Boolean).join(' / ')))}
            ${row('포맷', esc([a.format, a.discs > 1 ? a.discs + '장' : ''].filter(Boolean).join(' · ')))}
            ${row('에디션', esc(a.edition))}
            ${row('디스크 상태', esc(a.mediaCondition))}
            ${row('케이스 상태', esc(a.sleeveCondition))}
            ${row('보관 위치', esc(a.location))}
            ${row('구입', esc([a.purchaseDate, a.purchasePlace, a.price ? Util.won(a.price) : ''].filter(Boolean).join(' · ')))}
            ${row('태그', (a.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' '))}
            ${row('MusicBrainz', a.musicbrainzId ? `<a href="https://musicbrainz.org/release/${esc(a.musicbrainzId)}" target="_blank" rel="noopener">릴리스 페이지 ↗</a>` : '')}
          </dl>
        </div>
      </div>
      ${matrixRows ? `
        <h3>매트릭스 / 런아웃</h3>
        <div class="table-wrap"><table class="matrix-table">
          <thead><tr><th>디스크</th><th>매트릭스 / 런아웃</th><th>Mastering SID</th><th>Mould SID</th></tr></thead>
          <tbody>${matrixRows}</tbody>
        </table></div>` : ''}
      ${tracks ? `<h3>트랙리스트</h3><pre class="tracklist">${esc(tracks)}</pre>` : ''}
      ${a.notes ? `<h3>메모</h3><p class="notes">${esc(a.notes)}</p>` : ''}
      <footer class="dlg-foot">
        <span class="muted small">등록 ${new Date(a.createdAt).toLocaleDateString('ko-KR')}${a.updatedAt && a.updatedAt !== a.createdAt ? ` · 수정 ${new Date(a.updatedAt).toLocaleDateString('ko-KR')}` : ''}</span>
        <span class="spacer"></span>
        <button type="button" class="btn" id="btn-dup">복제</button>
        <button type="button" class="btn primary" id="btn-edit">수정</button>
      </footer>`;
    $('#btn-edit').onclick = () => { $('#dlg-detail').close(); openForm(a); };
    $('#btn-dup').onclick = () => {
      $('#dlg-detail').close();
      // 같은 앨범의 다른 프레싱을 등록할 때 편리하도록 매트릭스·구입정보를 비운 사본
      openForm({ ...a, id: null, matrix: [], purchaseDate: '', purchasePlace: '', price: '', mediaCondition: '', sleeveCondition: '', createdAt: null }, true);
    };
    $('#dlg-detail').showModal();
  }

  // ---------- 폼 ----------
  function openForm(album = null, asNew = false) {
    const form = $('#album-form');
    form.reset();
    editingId = album && !asNew ? album.id : null;
    $('#form-title').textContent = editingId ? '앨범 수정' : '앨범 등록';
    $('#btn-delete').classList.toggle('hidden', !editingId);
    $('#lookup-results').innerHTML = '';
    $('#matrix-list').innerHTML = '';

    const a = album || { status: 'owned', format: 'CD', discs: 1, purchaseDate: Util.today() };
    for (const el of form.elements) {
      if (!el.name || el.type === 'file') continue;
      let v = a[el.name];
      if (el.name === 'tags') v = (a.tags || []).join(', ');
      if (v !== undefined && v !== null) el.value = v;
    }
    (a.matrix && a.matrix.length ? a.matrix : [{}]).forEach(m => addMatrixRow(m));
    setCover(a.cover || null);
    updateBarcodeHint();
    $('#dlg-edit').showModal();
    if (!editingId) $('#f-barcode').focus();
  }

  function addMatrixRow(m = {}) {
    const discCount = $$('.matrix-row').length + 1;
    const div = document.createElement('div');
    div.className = 'matrix-row';
    div.innerHTML = `
      <input class="m-disc" placeholder="디스크" value="${esc(m.disc || discCount)}" aria-label="디스크 번호">
      <input class="m-code mono" placeholder="매트릭스 / 런아웃 (예: DIDP-1234 1A1)" value="${esc(m.code || '')}" aria-label="매트릭스">
      <input class="m-mastering mono" placeholder="IFPI L..." value="${esc(m.mastering || '')}" aria-label="Mastering SID">
      <input class="m-mould mono" placeholder="IFPI ..." value="${esc(m.mould || '')}" aria-label="Mould SID">
      <button type="button" class="icon-btn rm-matrix" aria-label="삭제">✕</button>`;
    $('#matrix-list').appendChild(div);
  }

  function setCover(dataUrl) {
    formCover = dataUrl;
    $('#cover-preview').innerHTML = dataUrl ? `<img src="${dataUrl}" alt="커버">` : '<span>커버 없음</span>';
  }

  function updateBarcodeHint() {
    const code = Util.normalizeBarcode($('#f-barcode').value);
    const hint = $('#barcode-hint');
    hint.className = 'hint';
    if (!code) { hint.textContent = ''; return; }
    const parts = [];
    const valid = Util.validateBarcode(code);
    if (valid === false) { parts.push('⚠ 체크 디지트가 맞지 않습니다. 번호를 확인해 주세요.'); hint.classList.add('warn'); }
    const dups = albums.filter(a => a.barcode === code && a.id !== editingId);
    if (dups.length) {
      hint.classList.add('warn');
      parts.push(`이미 같은 바코드로 ${dups.length}건 등록됨: ` + dups.map(d =>
        `${d.artist} – ${d.title}${(d.matrix || []).length ? ` [${d.matrix.map(m => m.code).join(', ')}]` : ''}`).join(' / ') +
        ' — 다른 프레싱이라면 매트릭스로 구분하세요.');
    }
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
      box.innerHTML = '<p class="muted small">결과를 선택하면 아래 항목이 채워집니다.</p>' + results.map((r, i) => `
        <button type="button" class="lookup-item" data-i="${i}">
          <strong>${esc(r.artist)} – ${esc(r.title)}</strong>
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
    set('year', r.year);
    set('country', r.country);
    set('discs', r.discs);
    set('musicbrainzId', r.musicbrainzId);
    const fmt = Lookup.mapFormat(r.format);
    if (fmt) set('format', fmt);
    $('#lookup-results').innerHTML = '<p class="muted">트랙리스트와 커버를 가져오는 중…</p>';
    const [det, blob] = await Promise.all([
      Lookup.details(r.musicbrainzId).catch(() => null),
      formCover ? Promise.resolve(null) : Lookup.coverBlob(r.musicbrainzId),
    ]);
    if (det && det.tracklist && !form.elements.tracklist.value.trim()) form.elements.tracklist.value = det.tracklist;
    if (blob) { try { setCover(await Util.resizeImage(blob)); } catch { /* 커버 없음 */ } }
    $('#lookup-results').innerHTML = '<p class="muted">✓ 정보를 불러왔습니다. 매트릭스 번호는 디스크를 보고 직접 입력해 주세요.</p>';
  }

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const title = (fd.get('title') || '').trim();
    const artist = (fd.get('artist') || '').trim();
    if (!title || !artist) { toast('제목과 아티스트는 필수입니다'); return; }

    const existing = editingId ? albums.find(a => a.id === editingId) : null;
    const now = Date.now();
    const num = k => { const v = fd.get(k); return v === '' || v == null ? '' : Number(v); };
    const str = k => (fd.get(k) || '').toString().trim();

    const album = {
      id: editingId || uid(),
      title, artist,
      barcode: Util.normalizeBarcode(fd.get('barcode')),
      label: str('label'),
      catalogNo: str('catalogNo'),
      year: num('year'),
      country: str('country').toUpperCase(),
      format: str('format'),
      discs: num('discs') || 1,
      edition: str('edition'),
      matrix: $$('.matrix-row').map(r => ({
        disc: $('.m-disc', r).value.trim(),
        code: $('.m-code', r).value.trim(),
        mastering: $('.m-mastering', r).value.trim(),
        mould: $('.m-mould', r).value.trim(),
      })).filter(m => m.code || m.mastering || m.mould),
      status: str('status') || 'owned',
      mediaCondition: str('mediaCondition'),
      sleeveCondition: str('sleeveCondition'),
      location: str('location'),
      purchaseDate: str('purchaseDate'),
      purchasePlace: str('purchasePlace'),
      price: num('price'),
      rating: Number(fd.get('rating')) || 0,
      tags: str('tags').split(',').map(t => t.trim()).filter(Boolean),
      tracklist: str('tracklist'),
      notes: str('notes'),
      musicbrainzId: str('musicbrainzId'),
      cover: formCover,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    await DB.put(album);
    const idx = albums.findIndex(a => a.id === album.id);
    if (idx >= 0) albums[idx] = album; else albums.push(album);
    $('#dlg-edit').close();
    render();
    toast(existing ? '수정했습니다' : `「${album.title}」 등록 완료`);
  }

  async function deleteAlbum(id) {
    const a = albums.find(x => x.id === id);
    if (!a || !confirm(`「${a.artist} – ${a.title}」을(를) 삭제할까요?`)) return;
    await DB.remove(id);
    albums = albums.filter(x => x.id !== id);
    $('#dlg-edit').close();
    render();
    toast('삭제했습니다');
  }

  // ---------- 스캐너 ----------
  async function openScanner() {
    const dlg = $('#dlg-scan');
    const video = $('#scan-video');
    const status = $('#scan-status');
    status.textContent = '카메라를 여는 중…';
    dlg.showModal();
    try {
      await Scanner.start(video, code => {
        dlg.close();
        $('#f-barcode').value = Util.normalizeBarcode(code);
        updateBarcodeHint();
        toast('바코드 인식: ' + code);
        doLookup();
      }, msg => { status.textContent = msg; });
    } catch (err) {
      status.textContent = '⚠ ' + (err.name === 'NotAllowedError' ? '카메라 권한이 거부되었습니다.' : err.message);
    }
  }

  // ---------- 통계 ----------
  function renderStats() {
    const owned = albums.filter(a => (a.status || 'owned') === 'owned');
    const wish = albums.filter(a => a.status === 'wishlist');
    const discs = owned.reduce((s, a) => s + (Number(a.discs) || 1), 0);
    const spent = owned.reduce((s, a) => s + (Number(a.price) || 0), 0);
    const artists = new Set(owned.map(a => a.artist)).size;
    const withMatrix = owned.filter(a => (a.matrix || []).length).length;

    const countBy = (list, fn) => {
      const m = new Map();
      list.forEach(a => { const k = fn(a); if (k) m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].sort((x, y) => y[1] - x[1]);
    };
    const bars = (title, entries, limit = 10) => {
      const top = entries.slice(0, limit);
      const max = Math.max(1, ...top.map(e => e[1]));
      return `<div class="card"><h3>${title}</h3>${top.length ? top.map(([k, v]) => `
        <div class="bar-row"><span class="bar-label" title="${esc(k)}">${esc(k)}</span>
          <span class="bar"><span style="width:${(v / max) * 100}%"></span></span><span class="bar-val">${v}</span></div>`).join('')
        : '<p class="muted">데이터 없음</p>'}</div>`;
    };

    const decades = countBy(owned, a => a.year ? Math.floor(a.year / 10) * 10 + '년대' : '')
      .sort((x, y) => parseInt(x[0]) - parseInt(y[0]));

    $('#stats').innerHTML = `
      <div class="stat-tiles">
        <div class="tile"><b>${owned.length}</b><span>보유 앨범</span></div>
        <div class="tile"><b>${discs}</b><span>디스크 수</span></div>
        <div class="tile"><b>${artists}</b><span>아티스트</span></div>
        <div class="tile"><b>${Util.won(spent)}</b><span>총 구입액</span></div>
        <div class="tile"><b>${withMatrix}</b><span>매트릭스 기록</span></div>
        <div class="tile"><b>${wish.length}</b><span>위시리스트</span></div>
      </div>
      <div class="stat-grid">
        ${bars('아티스트 TOP 10', countBy(owned, a => a.artist))}
        ${bars('연대별', decades, 20)}
        ${bars('포맷별', countBy(owned, a => a.format))}
        ${bars('레이블 TOP 10', countBy(owned, a => a.label))}
        ${bars('발매국가', countBy(owned, a => a.country))}
        ${bars('보관 위치', countBy(owned, a => a.location))}
      </div>`;
  }

  // ---------- 백업 ----------
  function exportJSON() {
    const data = { app: 'matrixandbarcode', version: 1, exportedAt: new Date().toISOString(), albums };
    Util.download(`cd-collection-${Util.today()}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  function exportCSV() {
    const head = ['아티스트', '제목', '바코드', '카탈로그번호', '레이블', '발매년도', '국가', '포맷', '디스크수', '에디션',
      '매트릭스', '상태', '디스크상태', '케이스상태', '보관위치', '구입일', '구입처', '구입가', '평점', '태그', '메모'];
    const rows = albums.map(a => [a.artist, a.title, a.barcode, a.catalogNo, a.label, a.year, a.country, a.format, a.discs, a.edition,
      (a.matrix || []).map(m => [m.disc && `D${m.disc}`, m.code, m.mastering, m.mould].filter(Boolean).join(' ')).join(' | '),
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
      const valid = list.filter(a => a && a.title && a.artist).map(a => ({ ...a, id: a.id || uid(), createdAt: a.createdAt || Date.now() }));
      if (!confirm(`${valid.length}건을 불러옵니다. 같은 ID의 기존 데이터는 덮어씁니다. 계속할까요?`)) return;
      await DB.putMany(valid);
      albums = await DB.all();
      render();
      toast(`${valid.length}건을 불러왔습니다`);
    } catch (err) {
      toast('불러오기 실패: ' + err.message);
    }
  }

  async function clearAll() {
    if (!albums.length) return;
    if (!confirm(`${albums.length}건을 모두 삭제합니다. 백업하셨나요?`)) return;
    if (prompt('확인을 위해 "삭제"를 입력하세요') !== '삭제') return;
    await DB.clear();
    albums = [];
    render();
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
    document.querySelector('main').innerHTML = `<div class="card"><h2>저장소를 열 수 없습니다</h2><p>${esc(err.message)}</p><p class="muted">시크릿 모드에서는 IndexedDB가 제한될 수 있습니다.</p></div>`;
  });
})();
