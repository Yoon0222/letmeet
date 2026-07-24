import { useRouter } from 'expo-router';
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

import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';
import type { AppNotification, NotificationTargetType } from '@/lib/types';

// 한 번에 불러오는 알림 개수 (종 뱃지·목록 공용)
const PAGE = 40;

type NotificationsContextValue = {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markAllRead: () => Promise<void>;
  /** 알림 탭 → 읽음 처리 + 대상 화면으로 이동 */
  openTarget: (n: AppNotification) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

// 알림 대상 → 이동할 경로. 매핑에 없으면 이동하지 않는다.
export function targetHref(
  targetType: NotificationTargetType | null,
  targetId: string | null,
): string | null {
  if (!targetType || !targetId) return null;
  switch (targetType) {
    case 'meetup':
      return `/meetup/${targetId}`;
    case 'club':
      return `/club/${targetId}`;
    case 'community_post':
      return `/community/${targetId}`;
    case 'tournament':
      return `/tournament/${targetId}`;
    case 'court':
      return `/court/${targetId}`;
    default:
      return null;
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const uid = session?.user?.id ?? null;
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!uid) {
      setItems([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE);
    setItems(data ?? []);
    setLoading(false);
  }, [uid]);

  // 세션에 맞춰 로드 + 실시간 구독(INSERT=뱃지 즉시 증가, UPDATE=읽음 반영).
  // refresh() 가 !uid 일 때 목록을 비우므로 로그아웃 시 자동 초기화된다.
  useEffect(() => {
    // refresh 는 비동기(await 후 setState)라 동기 cascading 렌더가 아니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    if (!uid) return;
    const channel = supabase
      .channel(`notifications:${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload) => {
          const row = payload.new as AppNotification;
          setItems((prev) => (prev.some((n) => n.id === row.id) ? prev : [row, ...prev]));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload) => {
          const row = payload.new as AppNotification;
          setItems((prev) => prev.map((n) => (n.id === row.id ? row : n)));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, refresh]);

  const unread = useMemo(() => items.filter((n) => !n.read_at).length, [items]);

  const markAllRead = useCallback(async () => {
    if (!uid) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now }))); // 낙관적
    await supabase.rpc('mark_notifications_read', { p_ids: null });
  }, [uid]);

  const openTarget = useCallback(
    (n: AppNotification) => {
      if (!n.read_at) {
        const now = new Date().toISOString();
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
        supabase.rpc('mark_notifications_read', { p_ids: [n.id] });
      }
      const href = targetHref(n.target_type, n.target_id);
      if (href) router.push(href as never);
    },
    [router],
  );

  // 푸시 알림을 탭했을 때(백그라운드/종료 상태 포함) 대상 화면으로 이동.
  // 네이티브 전용 — 웹에선 expo-notifications 의 응답 API 가 없어(호출 시 throw) 스킵한다.
  // 모듈/메서드 부재(옛 빌드 등)에도 크래시나지 않도록 로드·호출 모두 try/catch.
  useEffect(() => {
    if (!uid || Platform.OS === 'web') return;
    let Notifications: typeof import('expo-notifications') | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Notifications = require('expo-notifications');
    } catch {
      return;
    }
    if (!Notifications) return;
    const notif = Notifications;

    const go = (data: unknown) => {
      const d = (data ?? {}) as { target_type?: NotificationTargetType; target_id?: string };
      const href = targetHref(d.target_type ?? null, d.target_id ?? null);
      if (href) router.push(href as never);
    };

    let sub: { remove: () => void } | undefined;
    try {
      // 앱이 종료 상태에서 알림 탭으로 열렸을 때
      notif.getLastNotificationResponseAsync().then((res) => {
        if (res) go(res.notification.request.content.data);
      });
      // 실행/백그라운드 중 알림 탭
      sub = notif.addNotificationResponseReceivedListener((res) => {
        go(res.notification.request.content.data);
      });
    } catch {
      // 미지원 런타임 — 무시(딥링크만 비활성, 앱은 정상)
    }
    return () => sub?.remove();
  }, [uid, router]);

  const value = useMemo(
    () => ({ items, unread, loading, refresh, markAllRead, openTarget }),
    [items, unread, loading, refresh, markAllRead, openTarget],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications 는 NotificationsProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
