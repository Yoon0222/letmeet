'use client';

// DUPR SSO 연결 페이지. 앱(WebView)이 이 페이지를 열면 DUPR 로그인 iframe 이 뜬다.
// 사용자가 DUPR 로그인+동의하면 DUPR JS 가 부모창(이 페이지)에 message 이벤트를 쏜다:
//   { userToken, refreshToken, id, duprId, stats }
// 이 페이지는 그 duprId 를 앱(react-native WebView)으로 postMessage 로 전달한다.
// 앱은 그 duprId 로 dupr-verify 를 호출해 레이팅을 저장한다(동의 후엔 조회 성공).
//
// iframe URL 의 clientKey 는 base64(clientKey) — secret 아님, 클라이언트 노출 OK(DUPR 설계).
import { useEffect, useMemo, useState } from 'react';

const SSO_BASE = process.env.NEXT_PUBLIC_DUPR_SSO_BASE ?? 'https://uat.dupr.gg/login-external-app';
const CLIENT_KEY = process.env.NEXT_PUBLIC_DUPR_CLIENT_KEY ?? '';

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
  const src = useMemo(() => (CLIENT_KEY ? `${SSO_BASE}/${btoa(CLIENT_KEY)}` : ''), []);

  useEffect(() => {
    if (!CLIENT_KEY) {
      setStatus('error');
      setMsg('DUPR 연동 설정(NEXT_PUBLIC_DUPR_CLIENT_KEY)이 없어요.');
      return;
    }
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
      ) : (
        <iframe title="DUPR 로그인" src={src} allow="payment" style={{ width: '100%', height: '100vh', border: 0 }} />
      )}
    </main>
  );
}
