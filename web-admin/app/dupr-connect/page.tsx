'use client';

// DUPR SSO 연결 페이지. 앱(WebView)이 이 페이지를 열면 DUPR 로그인 iframe 이 뜬다.
// 사용자가 DUPR 로그인+동의하면 DUPR JS 가 부모창(이 페이지)에 message 이벤트를 쏜다:
//   { userToken, refreshToken, id, duprId, stats }
// 이 페이지는 그 duprId 를 앱(react-native WebView)으로 postMessage 로 전달한다.
// 앱은 그 duprId 로 dupr-verify 를 호출해 레이팅을 저장한다(동의 후엔 조회 성공).
//
// iframe URL 의 clientKey 는 base64(clientKey) — secret 아님, 클라이언트 노출 OK(DUPR 설계).
import { useEffect, useState } from 'react';

// clientKey(base64)/ssoBase 는 앱이 서버(Supabase 시크릿)에서 받아 URL 로 넘겨준다.
// (웹에 키를 중복 저장하지 않음. base64(clientKey) 는 iframe URL 에 노출되는 공개값.)
function getUrlParams() {
  if (typeof window === 'undefined') return { ck: '', sso: '' };
  const p = new URLSearchParams(window.location.search);
  return {
    ck: p.get('ck') ?? '',
    sso: p.get('sso') ?? 'https://uat.dupr.gg/login-external-app',
  };
}

// deno/next 브라우저에서 message 이벤트의 페이로드는 event.data 또는 event 자체에 있을 수 있어 둘 다 본다.
type SsoPayload = { duprId?: string; userToken?: string; refreshToken?: string; stats?: unknown };
function extract(e: MessageEvent): SsoPayload | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = e.data && (e.data.duprId || e.data.userToken) ? e.data : (e as any);
  if (d && (d.duprId || d.userToken)) {
    return { duprId: d.duprId, userToken: d.userToken, refreshToken: d.refreshToken, stats: d.stats };
  }
  return null;
}

export default function DuprConnectPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'done' | 'error'>('loading');
  const [msg, setMsg] = useState('');
  // src 는 클라이언트에서만 확정한다(SSR 에선 window 가 없어 빈 값 → 하이드레이션
  // 이후 useEffect 에서 URL 파라미터를 읽어 상태로 채운다). 이렇게 해야 iframe 이
  // 서버 렌더 값에 묶이지 않고 항상 DUPR URL 로 갱신된다.
  const [src, setSrc] = useState('');

  useEffect(() => {
    const { ck, sso } = getUrlParams();
    if (!ck) {
      setStatus('error');
      setMsg('DUPR 연동 설정이 없어요. 앱에서 다시 시도해 주세요.');
      return;
    }
    // ck 는 이미 base64(clientKey) 이므로 그대로 iframe 경로에 붙인다.
    setSrc(`${sso}/${ck}`);
    setStatus('ready');
    function onMsg(e: MessageEvent) {
      const p = extract(e);
      if (!p) return;
      // 앱(react-native WebView)으로 전달
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rn = (window as any).ReactNativeWebView;
      const payload = JSON.stringify({ type: 'dupr-sso', ...p });
      if (rn?.postMessage) rn.postMessage(payload);
      setStatus('done');
    }
    window.addEventListener('message', onMsg, false);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  return (
    <main style={{ minHeight: '100vh', margin: 0, background: '#FFFFFF', fontFamily: 'system-ui, sans-serif' }}>
      {status === 'error' ? (
        <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#E5484D', padding: 24, textAlign: 'center' }}>{msg}</div>
      ) : status === 'done' ? (
        <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#16A34A' }}>DUPR 연결 완료! 앱으로 돌아갑니다…</div>
      ) : src ? (
        <iframe title="DUPR 로그인" src={src} allow="payment" style={{ width: '100%', height: '100vh', border: 0 }} />
      ) : (
        <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#9CA3AF' }}>DUPR 로그인 준비 중…</div>
      )}
    </main>
  );
}
