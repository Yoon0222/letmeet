import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { registerForPushTokenAsync } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

// 네이티브에서 OAuth 브라우저 세션이 앱으로 돌아오면 마무리한다
WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  /** 초기 세션 로딩 여부 */
  initializing: boolean;
  signUp: (email: string, password: string, nickname: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithKakao: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [initializing, setInitializing] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[auth] 프로필 로드 실패:', error.message);
      return;
    }
    setProfile(data ?? null);
  }, []);

  // 세션 초기화 — 스플래시는 '세션 확인'까지만 기다린다 (프로필은 뒤에서 백그라운드 로드).
  useEffect(() => {
    let mounted = true;

    // 안전장치: 세션 조회가 어떤 이유로든 안 끝나도 스플래시가 영구히 멈추지 않도록.
    const safety = setTimeout(() => {
      if (mounted) setInitializing(false);
    }, 8000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      })
      .catch((e) => {
        console.warn('[auth] 세션 확인 실패:', e?.message ?? e);
      })
      .finally(() => {
        if (!mounted) return;
        clearTimeout(safety);
        setInitializing(false);
      });

    // ⚠️ onAuthStateChange 콜백 안에서 다른 supabase 호출을 await 하면 내부 auth 락과
    // 교착(deadlock)이 생겨 부팅이 무한로딩에 걸릴 수 있다 → 여기선 세션만 동기로 반영하고,
    // 프로필은 아래 별도 effect 가 세션 변화에 맞춰 백그라운드로 로드한다.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      if (!newSession) setProfile(null);
      setInitializing(false);
    });

    return () => {
      mounted = false;
      clearTimeout(safety);
      sub.subscription.unsubscribe();
    };
  }, []);

  // 세션 사용자에 맞춰 프로필을 백그라운드 로드 (스플래시를 막지 않음)
  useEffect(() => {
    const uid = session?.user?.id;
    // loadProfile 은 비동기(await 후 setProfile)라 동기 cascading 렌더가 아니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (uid) loadProfile(uid);
  }, [session?.user?.id, loadProfile]);

  // 로그인한 기기의 Expo 푸시 토큰을 등록·저장 (내 경기 알림용). 실기기에서만 동작.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const token = await registerForPushTokenAsync();
      if (cancelled || !token) return;
      await supabase.from('profiles').update({ push_token: token }).eq('id', uid);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const signUp = useCallback(
    async (email: string, password: string, nickname: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nickname } },
      });
      if (error) throw error;
    },
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  // 브라우저 기반 OAuth 공통 (카카오·구글). 웹=전체 리다이렉트, 네이티브=인앱 브라우저 후 code 교환.
  const signInWithBrowserOAuth = useCallback(async (provider: 'kakao' | 'google') => {
    if (Platform.OS === 'web') {
      // 웹: 전체 페이지 리다이렉트 후 detectSessionInUrl 이 세션을 복원
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      return;
    }
    // 네이티브: 인앱 브라우저로 열고, 돌아온 URL 의 code 를 세션으로 교환
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('인증 URL 을 받지 못했습니다.');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) return; // 사용자가 취소
    const code = Linking.parse(result.url).queryParams?.code;
    if (typeof code === 'string') {
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) throw exErr;
    }
  }, []);

  const signInWithKakao = useCallback(() => signInWithBrowserOAuth('kakao'), [signInWithBrowserOAuth]);
  const signInWithGoogle = useCallback(() => signInWithBrowserOAuth('google'), [signInWithBrowserOAuth]);

  // 애플: iOS 네이티브 Sign in with Apple → identityToken 을 Supabase 로 교환
  const signInWithApple = useCallback(async () => {
    if (Platform.OS !== 'ios') throw new Error('Apple 로그인은 iOS 에서만 지원돼요.');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AppleAuthentication = require('expo-apple-authentication') as typeof import('expo-apple-authentication');
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) throw new Error('Apple 인증 토큰을 받지 못했습니다.');
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  // 회원 탈퇴: 본인 계정(auth.users) 삭제 → 데이터 연쇄 정리 → 로그아웃
  const deleteAccount = useCallback(async () => {
    const { error } = await supabase.rpc('delete_account');
    if (error) throw error;
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = useMemo(
    () => ({
      session,
      profile,
      initializing,
      signUp,
      signIn,
      signInWithKakao,
      signInWithGoogle,
      signInWithApple,
      signOut,
      deleteAccount,
      refreshProfile,
    }),
    [session, profile, initializing, signUp, signIn, signInWithKakao, signInWithGoogle, signInWithApple, signOut, deleteAccount, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
