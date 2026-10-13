// MusicBrainz 바코드 검색 (API 키 불필요, CORS 지원)
// https://musicbrainz.org/doc/MusicBrainz_API
window.Lookup = (() => {
  const MB = 'https://musicbrainz.org/ws/2';

  async function byBarcode(barcode) {
    const url = `${MB}/release/?query=barcode:${encodeURIComponent(barcode)}&fmt=json&limit=10`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`MusicBrainz 응답 오류 (${res.status})`);
    const data = await res.json();
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
      discs: media.length || 1,
      trackCount: r['track-count'] || 0,
    };
  }

  // 트랙리스트까지 포함한 상세 정보
  async function details(mbid) {
    const res = await fetch(`${MB}/release/${mbid}?inc=recordings&fmt=json`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`MusicBrainz 응답 오류 (${res.status})`);
    const r = await res.json();
    const multi = (r.media || []).length > 1;
    const tracks = [];
    (r.media || []).forEach((m, di) => {
      if (multi) tracks.push(`[Disc ${di + 1}${m.title ? ' – ' + m.title : ''}]`);
      (m.tracks || []).forEach(t => tracks.push(`${t.number}. ${t.title}`));
    });
    return { tracklist: tracks.join('\n') };
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

  function mapFormat(f) {
    const s = (f || '').toLowerCase();
    if (!s) return '';
    if (s.includes('hybrid sacd')) return 'Hybrid SACD';
    if (s.includes('sacd')) return 'SACD';
    if (s.includes('shm')) return 'SHM-CD';
    if (s.includes('blu-spec')) return 'Blu-spec CD';
    if (s.includes('hqcd')) return 'HQCD';
    if (s.includes('cd-r')) return 'CD-R';
    if (s.includes('dvd')) return 'CD+DVD';
    if (s.includes('blu-ray')) return 'CD+Blu-ray';
    if ((s.match(/cd/g) || []).length >= 2) return '2CD';
    if (s.includes('cd')) return 'CD';
    return '기타';
  }

  return { byBarcode, details, coverBlob, mapFormat };
})();
