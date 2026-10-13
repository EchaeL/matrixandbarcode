// 접속한 기기 종류와 화면 크기를 보고 PC 버전 / 모바일 버전을 정함.
// <head>에서 바로 실행해 화면이 그려지기 전에 <html data-view="pc|mobile">을 설정한다.
// 태블릿(아이패드 등)은 PC 버전, 휴대폰은 모바일 버전. 설정에서 직접 고를 수도 있음.
window.Device = (() => {
  const KEY = 'mab-view';
  const ua = navigator.userAgent;

  function info() {
    const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isPhone = !isIPad && /iPhone|iPod|Android.+Mobile|Windows Phone|Mobile.+Firefox|SamsungBrowser.+Mobile/i.test(ua);
    const isTablet = isIPad || (!isPhone && /Android|Tablet/i.test(ua));
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const shortSide = Math.min(screen.width, screen.height);

    let kind, name;
    if (isPhone) { kind = 'phone'; name = /iPhone|iPod/.test(ua) ? 'iPhone' : /SM-|Samsung/i.test(ua) ? '삼성 휴대폰' : /Android/.test(ua) ? '안드로이드 휴대폰' : '휴대폰'; }
    else if (isTablet) { kind = 'tablet'; name = isIPad ? 'iPad' : '태블릿'; }
    else if (touch && shortSide < 600) { kind = 'phone'; name = '휴대폰'; }
    else { kind = 'desktop'; name = /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : 'PC'; }

    return { kind, name, screen: `${screen.width}×${screen.height}`, viewport: `${window.innerWidth}×${window.innerHeight}` };
  }

  function pref() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
  }

  // 자동일 때: 휴대폰이면 모바일, 아니면 PC. 단, PC 창을 아주 좁게 줄이면 모바일 화면으로
  function autoView() {
    const i = info();
    if (i.kind === 'phone') return 'mobile';
    if (i.kind === 'tablet') return 'pc';
    return window.innerWidth < 560 ? 'mobile' : 'pc';
  }

  function view() {
    const p = pref();
    return p === 'pc' || p === 'mobile' ? p : autoView();
  }

  function apply() {
    const v = view();
    if (document.documentElement.dataset.view !== v) {
      document.documentElement.dataset.view = v;
      window.dispatchEvent(new CustomEvent('viewchange', { detail: v }));
    }
  }

  function setPref(p) {
    try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* 무시 */ }
    apply();
  }

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);

  return { info, pref, setPref, view };
})();
