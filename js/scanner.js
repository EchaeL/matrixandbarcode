// 카메라 바코드 스캐너.
// 브라우저 내장 BarcodeDetector가 있으면 사용하고, 없으면(iOS Safari, Firefox 등) ZXing을 불러와 사용.
window.Scanner = (() => {
  const ZXING_URL = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
  let stream = null;
  let running = false;
  let zxingReader = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('스캐너 라이브러리를 불러오지 못했습니다'));
      document.head.appendChild(s);
    });
  }

  async function hasNativeDetector() {
    if (!('BarcodeDetector' in window)) return false;
    try {
      const supported = await BarcodeDetector.getSupportedFormats();
      return FORMATS.some(f => supported.includes(f));
    } catch {
      return false;
    }
  }

  async function start(video, onResult, onStatus) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('이 브라우저는 카메라를 지원하지 않습니다 (HTTPS 환경이 필요합니다)');
    }
    running = true;

    if (await hasNativeDetector()) {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream;
      await video.play();
      const detector = new BarcodeDetector({ formats: FORMATS });
      onStatus('스캔 중…');
      const loop = async () => {
        if (!running) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length) {
            const value = codes[0].rawValue;
            stop(video);
            onResult(value);
            return;
          }
        } catch { /* 프레임 준비 전 */ }
        setTimeout(loop, 150);
      };
      loop();
      return;
    }

    onStatus('스캐너 준비 중…');
    await loadScript(ZXING_URL);
    if (!running) return;
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
    ]);
    zxingReader = new ZXing.BrowserMultiFormatReader(hints);
    onStatus('스캔 중…');
    zxingReader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (result) => {
      if (result && running) {
        const value = result.getText();
        stop(video);
        onResult(value);
      }
    });
  }

  function stop(video) {
    running = false;
    if (zxingReader) { zxingReader.reset(); zxingReader = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (video) { video.pause(); video.srcObject = null; }
  }

  return { start, stop };
})();
