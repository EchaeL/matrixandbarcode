// MusicBrainz 바코드 검색 (API 키 불필요, CORS 지원)
// https://musicbrainz.org/doc/MusicBrainz_API
window.Lookup = (() => {
  const MB = 'https://musicbrainz.org/ws/2';

  async function getJSON(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`MusicBrainz 응답 오류 (${res.status})`);
    return res.json();
  }

  async function byBarcode(barcode) {
    const data = await getJSON(`${MB}/release/?query=barcode:${encodeURIComponent(barcode)}&fmt=json&limit=10`);
    return (data.releases || []).map(summarize);
  }

  function summarize(r) {
    const li = (r['label-info'] || [])[0] || {};
    const media = r.media || [];
    return {
      musicbrainzId: r.id,
      title: r.title || '',
      artist: (r['artist-credit'] || []).map(a => a.name + (a.joinphrase || '')).join(''),
      year: r.date ? parseInt(r.date.slice(0, 4), 10) || '' : '',
      date: r.date || '',
      country: r.country || '',
      label: li.label ? li.label.name : '',
      catalogNo: li['catalog-number'] || '',
      barcode: r.barcode || '',
      format: media.map(m => m.format).filter(Boolean).join(' + '),
    };
  }

  // 디스크(미디어)별 종류와 트랙리스트
  async function details(mbid) {
    const r = await getJSON(`${MB}/release/${mbid}?inc=recordings&fmt=json`);
    return {
      discs: (r.media || []).map(m => ({
        type: mapDiscType(m.format),
        title: m.title || '',
        tracklist: (m.tracks || []).map(t => `${t.number}. ${t.title}`).join('\n'),
      })),
    };
  }

  // Cover Art Archive 이미지를 Blob으로 가져옴 (없으면 null)
  async function coverBlob(mbid) {
    try {
      const res = await fetch(`https://coverartarchive.org/release/${mbid}/front-500`);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  function mapDiscType(f) {
    const s = (f || '').toLowerCase();
    if (!s) return 'CD';
    if (s.includes('hybrid sacd')) return 'Hybrid SACD';
    if (s.includes('sacd')) return 'SACD';
    if (s.includes('shm')) return 'SHM-CD';
    if (s.includes('blu-spec')) return 'Blu-spec CD';
    if (s.includes('hqcd')) return 'HQCD';
    if (s.includes('cd-r')) return 'CD-R';
    if (s.includes('dvd')) return 'DVD';
    if (s.includes('blu-ray')) return 'Blu-ray';
    if (s.includes('cd')) return 'CD';
    return '기타';
  }

  return { byBarcode, details, coverBlob };
})();
