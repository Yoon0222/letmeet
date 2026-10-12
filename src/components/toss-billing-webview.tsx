import { useCallback, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import WebView from 'react-native-webview';

// 토스 카드 등록(빌링 인증) 웹뷰 — 클럽 구독(payment/subscribe)과 클럽 회비(payment/dues-card)가 함께 쓴다.
//   화면에 안내 HTML 을 띄우고, 사용자가 버튼을 누르면 토스 카드 등록 창으로 넘어간다.
//   등록이 끝나면 authKey 를 onAuth 로 넘긴다(한 번만). 그 뒤의 서버 호출은 부르는 화면이 맡는다.

const APP_URL_PREFIX = 'pickleball://';
const SUCCESS_URL = 'https://pinut.org/payment/success';
const FAIL_URL = 'https://pinut.org/payment/fail';

function getQuery(url: string) {
  const i = url.indexOf('?');
  return i < 0 ? new URLSearchParams() : new URLSearchParams(url.slice(i + 1));
}
function unwrap(url: string) {
  if (!url.startsWith(APP_URL_PREFIX)) return url;
  const nested = getQuery(url).get('url');
  return nested ? decodeURIComponent(nested) : url;
}
function hasBillingSuccess(url: string) {
  const q = getQuery(url);
  return Boolean(q.get('authKey') && q.get('customerKey'));
}
function hasFailure(url: string) {
  const q = getQuery(url);
  return Boolean(q.get('code') || q.get('message'));
}
function convertIntentUrl(url: string) {
  const idx = url.indexOf('#Intent;');
  if (!url.startsWith('intent://') || idx < 0) return { appUrl: url, packageName: undefined as string | undefined };
  const appLink = url.slice('intent://'.length, idx);
  const part = url.slice(idx);
  const scheme = part.match(/;scheme=([^;]+)/)?.[1];
  const packageName = part.match(/;package=([^;]+)/)?.[1];
  const fallback = part.match(/;S\.browser_fallback_url=([^;]+)/)?.[1];
  return { appUrl: scheme ? `${scheme}://${appLink}` : fallback ? decodeURIComponent(fallback) : url, packageName };
}
async function openExternal(url: string) {
  const { appUrl, packageName } = convertIntentUrl(url);
  try {
    await Linking.openURL(appUrl);
  } catch {
    if (Platform.OS === 'android' && packageName) await Linking.openURL(`market://details?id=${packageName}`);
  }
}
function htmlEscape(v: string) {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

/** 카드 등록 안내 화면(HTML). 문구만 다르고 등록 동작은 같다. */
export function billingAuthHtml(args: {
  clientKey: string;
  customerKey: string;
  eyebrow: string; // 상단 작은 제목(영문)
  heading: string; // 큰 제목(금액 등)
  sub: string; // 제목 아래 설명
  notice: string; // 노란 안내 상자
  rows: [label: string, value: string][];
  buttonLabel: string;
  customerName?: string;
  customerEmail?: string;
}) {
  const successUrl = `${SUCCESS_URL}?flow=billing`;
  // 테스트 키(test_ck)일 때만 "테스트 환경" 안내를 노출 — 라이브(live_ck)에선 숨김
  const isTest = args.clientKey.startsWith('test_ck_');
  const info = JSON.stringify({
    clientKey: args.clientKey,
    customerKey: args.customerKey,
    successUrl,
    failUrl: FAIL_URL,
    customerName: args.customerName,
    customerEmail: args.customerEmail,
  });
  const rows = args.rows
    .map(([k, v]) => `<div class="rowline"><span class="k">${htmlEscape(k)}</span><span>${htmlEscape(v)}</span></div>`)
    .join('');
  return `<!doctype html><html lang="ko"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<script src="https://js.tosspayments.com/v2/standard"></script>
<style>
  :root{color-scheme:dark;--green:#16C784;--bg:#05080A;--surface:#0E141A;--line:rgba(255,255,255,.09);--text:#F9FAFB;--sub:#A3AAB5;--muted:#6B7280;--warn:#FBBF24;}
  *{box-sizing:border-box;} body{margin:0;min-height:100vh;background:linear-gradient(180deg,#07100D 0%,var(--bg) 34%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
  main{min-height:100vh;padding:24px 24px calc(96px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:16px;}
  .wordmark{font-size:18px;font-weight:900;} .wordmark span{color:var(--green);}
  .hero{padding:24px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(145deg,rgba(18,26,34,.96),rgba(11,16,21,.96));}
  .eyebrow{color:var(--green);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;}
  h1{margin:12px 0 6px;font-size:34px;line-height:1.05;} .order{margin:0;color:var(--sub);font-size:14px;font-weight:800;}
  .panel{padding:20px;border:1px solid var(--line);border-radius:24px;background:rgba(18,26,34,.94);}
  .notice{padding:13px 14px;border-radius:16px;background:rgba(254,243,199,.12);color:var(--warn);font-size:13px;font-weight:800;line-height:1.45;}
  .rows{margin:16px 0;} .rowline{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px;font-weight:800;} .rowline .k{color:var(--muted);flex-shrink:0;} .rowline:last-child{border-bottom:0;}
  .button{width:100%;height:58px;border:0;border-radius:18px;background:var(--green);color:#fff;font-size:16px;font-weight:900;box-shadow:0 16px 36px rgba(22,199,132,.22);margin-top:8px;}
  .button:disabled{opacity:.55;box-shadow:none;}
  .terms{margin:14px 2px 0;color:var(--muted);font-size:11px;line-height:1.5;font-weight:700;text-align:center;}
  .message{min-height:20px;margin:14px 0 0;color:var(--sub);font-size:12px;font-weight:800;text-align:center;white-space:pre-wrap;}
</style></head><body><main>
  <div class="wordmark">P<span>!</span>NUT</div>
  <section class="hero"><div class="eyebrow">${htmlEscape(args.eyebrow)}</div><h1>${htmlEscape(args.heading)}</h1><p class="order">${htmlEscape(args.sub)}</p></section>
  <section class="panel">
    <div class="notice">${isTest ? '테스트 환경입니다. 실제로 결제되지 않아요. ' : ''}${htmlEscape(args.notice)}</div>
    <div class="rows">${rows}</div>
    <button id="btn" class="button" type="button">${htmlEscape(args.buttonLabel)}</button>
    <p class="terms">카드 등록 시 토스페이먼츠 자동결제 약관 및 개인정보 처리에 동의한 것으로 처리됩니다.</p>
    <p id="msg" class="message">카드 등록 창으로 이동합니다.</p>
  </section></main>
<script>
  var info = ${info};
  var btn = document.getElementById('btn'); var msg = document.getElementById('msg');
  async function run(){
    btn.disabled = true; msg.textContent = '카드 등록 창을 여는 중입니다.';
    try{
      var tp = TossPayments(info.clientKey);
      var payment = tp.payment({ customerKey: info.customerKey });
      await payment.requestBillingAuth({ method:'CARD', successUrl: info.successUrl, failUrl: info.failUrl, customerEmail: info.customerEmail, customerName: info.customerName });
    }catch(e){ btn.disabled = false; msg.textContent = (e && e.message) ? e.message : '카드 등록 창을 열지 못했어요.'; }
  }
  btn.addEventListener('click', run);
</script></body></html>`;
}

type Props = {
  html: string;
  /** 카드 등록 성공 — 한 번만 불린다. customerKey 는 토스가 돌려준 값(없으면 빈 문자열). */
  onAuth: (authKey: string, customerKey: string) => void;
  /** 카드 등록 취소·실패 */
  onFail: (message: string) => void;
  onLoadEnd?: () => void;
};

export function TossBillingWebView({ html, onAuth, onFail, onLoadEnd }: Props) {
  const handledRef = useRef(false);

  const handleUrl = useCallback(
    (url: string) => {
      if (handledRef.current) return true;
      const u = unwrap(url);
      if (u.startsWith(SUCCESS_URL) || hasBillingSuccess(u)) {
        handledRef.current = true;
        const q = getQuery(u);
        onAuth(q.get('authKey') ?? '', q.get('customerKey') ?? '');
        return true;
      }
      if (u.startsWith(FAIL_URL) || hasFailure(u)) {
        const q = getQuery(u);
        onFail(q.get('message') ? decodeURIComponent(q.get('message') ?? '') : '카드 등록이 취소되었어요.');
        return true;
      }
      return false;
    },
    [onAuth, onFail],
  );

  const shouldStart = useCallback(
    (req: { url?: string }) => {
      const url = req.url;
      if (!url || url === 'undefined' || handledRef.current) return false;
      if (handleUrl(url)) return false;
      const lower = url.toLowerCase();
      const web = ['http://', 'https://', 'about:', 'data:', 'blob:', 'javascript:'].some((p) => lower.startsWith(p));
      if (web) return true;
      void openExternal(url);
      return false;
    },
    [handleUrl],
  );

  return (
    <WebView
      source={{ html, baseUrl: 'https://pinut.org' }}
      originWhitelist={['*']}
      javaScriptEnabled
      domStorageEnabled
      javaScriptCanOpenWindowsAutomatically
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      mixedContentMode="always"
      setSupportMultipleWindows
      onShouldStartLoadWithRequest={shouldStart}
      onOpenWindow={(e) => {
        const t = e.nativeEvent.targetUrl;
        if (!t || t === 'undefined') return;
        if (handleUrl(t)) return;
        void openExternal(t);
      }}
      onLoadEnd={onLoadEnd}
    />
  );
}
