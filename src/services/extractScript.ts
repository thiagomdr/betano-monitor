export const NAVIGATE_TO_URL_JS = (url: string) => `
(function () {
  try {
    window.location.href = ${JSON.stringify(url)};
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'navigate', ok: true }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'navigate',
      ok: false,
      error: String(e),
    }));
  }
})();
true;
`;

export const EXTRACT_PAGE_TEXT_JS = `
(function () {
  try {
    const text = document.body?.innerText || '';
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'scrape',
      ok: true,
      text,
    }));
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'scrape',
      ok: false,
      error: String(e),
    }));
  }
})();
true;
`;

export const CLICK_BASKETBALL_JS = `
(function () {
  try {
    const nodes = Array.from(document.querySelectorAll('a, button, span, div, li'));
    const target = nodes.find((el) => {
      const label = (el.textContent || '').trim().toLowerCase();
      return label === 'basquete' || label === 'basketball';
    });
    if (target) {
      target.click();
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'basketball', ok: true }));
    } else {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'basketball', ok: false }));
    }
  } catch (e) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'basketball',
      ok: false,
      error: String(e),
    }));
  }
})();
true;
`;
