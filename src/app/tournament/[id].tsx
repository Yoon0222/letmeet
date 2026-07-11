import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BracketTree } from '@/components/bracket-tree';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useLoading } from '@/contexts/loading';
import { groupMembers, standings } from '@/lib/bracket';
import { formatMeetupTime, skillLabel, skillRangeLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type {
  EntryStatus,
  PartnerProfile,
  TournamentCourt,
  TournamentEntryWithProfile,
  TournamentMatch,
  TournamentWithCounts,
} from '@/lib/types';

const ENTRY_LABEL: Record<EntryStatus, string> = {
  pending: '승인 대기중',
  approved: '참가 확정',
  rejected: '거절됨',
  withdrawn: '철회됨',
  waitlist: '대기열',
};

export default function TournamentDetail() {
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { show, hide } = useLoading();
  const uid = session?.user.id;

  const [t, setT] = useState<TournamentWithCounts | null>(null);
  const [entries, setEntries] = useState<TournamentEntryWithProfile[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [courts, setCourts] = useState<TournamentCourt[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [tab, setTab] = useState<'info' | 'prelim' | 'final'>('info');
  const [groupTab, setGroupTab] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [nowMs, setNowMs] = useState(0); // 로드 시점 현재시각 (조추첨 공개/당일 판단용)

  // 복식 파트너 검색/선택
  const [partnerQuery, setPartnerQuery] = useState('');
  const [partnerResults, setPartnerResults] = useState<PartnerProfile[]>([]);
  const [partnerSel, setPartnerSel] = useState<PartnerProfile | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: tour }, { data: ents }, { data: ms }, { data: cs }] = await Promise.all([
      supabase.from('tournaments_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('tournament_entries')
        .select(
          '*, profiles:profiles!tournament_entries_user_id_fkey(id, nickname, skill_level, avatar_url, region), partner:profiles!tournament_entries_partner_id_fkey(id, nickname, skill_level, avatar_url, region)',
        )
        .eq('tournament_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', id)
        .order('slot', { ascending: true }),
      supabase.from('tournament_courts').select('*').eq('tournament_id', id).order('sort', { ascending: true }),
    ]);
    setT(tour ?? null);
    setEntries((ents as unknown as TournamentEntryWithProfile[]) ?? []);
    setMatches((ms as TournamentMatch[]) ?? []);
    setCourts((cs as TournamentCourt[]) ?? []);
    setNowMs(Date.now());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({ title: t?.title ?? '대회' });
  }, [navigation, t?.title]);

  const myEntry = entries.find((e) => e.user_id === uid);
  // 내가 다른 사람의 파트너로 이미 등록돼 있는지 (중복 신청 방지)
  const iAmPartner = entries.find((e) => e.partner_id === uid);
  const approved = entries.filter((e) => e.status === 'approved');
  const canRegister = t?.status === 'registration';
  const isDoubles = t?.discipline === 'doubles';
  const isOrganizer = !!t && t.organizer_id === uid;

  // 조추첨 공개: 시합 전날 오후 7시부터 선수에게 공개 (운영자는 항상)
  const drawRevealAt = t
    ? (() => {
        const d = new Date(t.start_at);
        d.setDate(d.getDate() - 1);
        d.setHours(19, 0, 0, 0);
        return d;
      })()
    : null;
  const drawRevealed = isOrganizer || (!!drawRevealAt && nowMs >= drawRevealAt.getTime());

  // 출전 신고: 대회 당일에만 가능
  const isEventDay = !!t && nowMs > 0 && new Date(t.start_at).toDateString() === new Date(nowMs).toDateString();
  const checkedIn = !!myEntry?.checked_in_at;

  // 참가자 id → 표시 이름(복식은 파트너 포함)
  const nameOf = useCallback(
    (entryId: string | null): string => {
      if (!entryId) return '부전승';
      const e = entries.find((x) => x.user_id === entryId);
      if (!e) return '미정';
      const nick = e.profiles?.nickname ?? '?';
      const partner = e.partner?.nickname ?? e.partner_name;
      return isDoubles && partner ? `${nick} / ${partner}` : nick;
    },
    [entries, isDoubles],
  );

  // 대진 데이터 분해
  const groupMatchesAll = matches.filter((m) => m.phase === 'group');
  const koMatches = matches
    .filter((m) => m.phase === 'knockout')
    .sort((a, b) => (a.round_order ?? 0) - (b.round_order ?? 0) || a.slot - b.slot);
  const groupNos = [...new Set(groupMatchesAll.map((m) => m.group_no ?? 1))].sort((a, b) => a - b);
  const myMatches = matches.filter((m) => m.entry1_id === uid || m.entry2_id === uid);

  // 경기에 배정된 코트 라벨 (예: "3 · 실내")
  const courtLabelOf = useCallback(
    (cid: string | null): string | undefined => {
      if (!cid) return undefined;
      const c = courts.find((x) => x.id === cid);
      return c ? `${c.name} · ${c.indoor ? '실내' : '실외'}` : undefined;
    },
    [courts],
  );

  // 참가자 프로필 사진 (경기 이름 옆 표시용)
  const avatarOf = useCallback(
    (entryId: string | null): { uri: string | null; nickname: string } | null => {
      if (!entryId) return null;
      const e = entries.find((x) => x.user_id === entryId);
      if (!e?.profiles) return null;
      return { uri: e.profiles.avatar_url, nickname: e.profiles.nickname };
    },
    [entries],
  );

  // 이름 검색
  const q = search.trim().toLowerCase();
  const matchHit = (m: TournamentMatch) =>
    !q || nameOf(m.entry1_id).toLowerCase().includes(q) || nameOf(m.entry2_id).toLowerCase().includes(q);
  const approvedShown = approved.filter(
    (e) =>
      !q ||
      (e.profiles?.nickname ?? '').toLowerCase().includes(q) ||
      (e.partner?.nickname ?? e.partner_name ?? '').toLowerCase().includes(q),
  );
  // 대기열: 내 순번 / 정원이 찼는지
  const myWaitlistRank = entries.filter((e) => e.status === 'waitlist').findIndex((e) => e.user_id === uid) + 1;
  const slotsFull =
    !!t && entries.filter((e) => e.status === 'pending' || e.status === 'approved').length >= t.max_participants;

  // 대진이 있고 공개됐으면 정보/예선/본선 탭으로 분리 (미공개 시 선수에겐 정보 탭만)
  const drawGenerated = matches.length > 0;
  const hasBracket = drawGenerated && drawRevealed;
  const tabItems: { key: 'info' | 'prelim' | 'final'; label: string }[] = [
    { key: 'info', label: '정보' },
    ...(groupMatchesAll.length > 0 ? [{ key: 'prelim' as const, label: '예선' }] : []),
    ...(koMatches.length > 0 ? [{ key: 'final' as const, label: '본선' }] : []),
  ];

  // 파트너 이름으로 회원 검색 (동명이인 대비 → 목록에서 선택). 300ms 디바운스.
  useEffect(() => {
    const q = partnerQuery.trim();
    if (partnerSel || q.length < 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPartnerResults([]);
      return;
    }
    setSearching(true);
    // 이미 이 대회에 참가 중인 사람(신청자·파트너)은 파트너로 못 고르게 제외
    const taken = new Set(
      entries.flatMap((e) => [e.user_id, e.partner_id]).filter(Boolean) as string[],
    );
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, skill_level, avatar_url, region')
        .ilike('nickname', `%${q}%`)
        .neq('id', uid ?? '')
        .limit(16);
      const list = ((data as PartnerProfile[]) ?? []).filter((p) => !taken.has(p.id)).slice(0, 8);
      setPartnerResults(list);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [partnerQuery, partnerSel, uid, entries]);

  // 참가 신청 전 확인 알럿
  function confirmApply() {
    if (isDoubles && !partnerSel) {
      Alert.alert('파트너 필요', '복식은 함께 출전할 파트너를 선택해야 해요.');
      return;
    }
    const partnerLine = isDoubles && partnerSel ? `\n파트너: ${partnerSel.nickname}` : '';
    Alert.alert(
      slotsFull ? '대기 신청' : '참가 신청',
      `${t?.title ?? '대회'}${partnerLine}\n${slotsFull ? '정원이 차서 대기열로 신청됩니다.' : '이 대회에 참가 신청할까요?'}`,
      [
        { text: '닫기', style: 'cancel' },
        { text: slotsFull ? '대기 신청' : '신청', onPress: apply },
      ],
    );
  }

  async function apply() {
    if (!uid || !id) return;
    if (isDoubles && !partnerSel) {
      Alert.alert('파트너 필요', '복식은 함께 출전할 파트너를 선택해야 해요.');
      return;
    }
    setActing(true);
    const { error } = await supabase.from('tournament_entries').insert({
      tournament_id: id,
      user_id: uid,
      partner_id: isDoubles ? partnerSel?.id ?? null : null,
      partner_name: isDoubles ? partnerSel?.nickname ?? null : null,
    });
    setActing(false);
    if (error) {
      Alert.alert('신청 실패', error.message);
      return;
    }
    await show();
    await load();
    hide();
  }

  function confirmCancel() {
    Alert.alert('참가 취소', '대회 참가 신청을 취소할까요?', [
      { text: '닫기', style: 'cancel' },
      {
        text: '신청 취소',
        style: 'destructive',
        onPress: async () => {
          if (!uid || !id) return;
          setActing(true);
          await supabase.from('tournament_entries').delete().eq('tournament_id', id).eq('user_id', uid);
          setActing(false);
          load();
        },
      },
    ]);
  }

  async function checkIn() {
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase
      .from('tournament_entries')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('tournament_id', id)
      .eq('user_id', uid);
    setActing(false);
    if (error) {
      Alert.alert('출전 신고 실패', error.message);
      return;
    }
    load();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16C784" />
      </View>
    );
  }
  if (!t) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>대회를 찾을 수 없어요.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.headerArea}>
        <View style={styles.badgeRow}>
          <Badge label={t.discipline === 'doubles' ? '복식' : '단식'} color="#7A4E00" bg="rgba(245,166,35,0.16)" />
          {t.status === 'registration' ? (
            <Badge label="접수중" />
          ) : (
            <Badge
              label={t.status === 'ongoing' ? '진행중' : t.status === 'finished' ? '종료' : '취소됨'}
              color="#60646C"
              bg="rgba(136,135,128,0.14)"
            />
          )}
        </View>
        <Text style={styles.title}>{t.title}</Text>
      </View>

      {hasBracket && (
        <View style={styles.tabBar}>
          {tabItems.map((it) => {
            const active = tab === it.key;
            return (
              <Pressable key={it.key} onPress={() => setTab(it.key)} style={styles.tabItem}>
                <Text style={[styles.tabText, { color: active ? '#16C784' : '#6B7280' }]}>{it.label}</Text>
                <View style={[styles.tabUnderline, { backgroundColor: active ? '#16C784' : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {(approved.length > 0 || hasBracket) && (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#6B7280" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="이름으로 검색"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              style={styles.searchInput}
            />
            {search.length > 0 && (
              <Ionicons name="close-circle" size={18} color="#9CA3AF" onPress={() => setSearch('')} />
            )}
          </View>
        )}
        {(!hasBracket || tab === 'info') && (
          <>
            <View style={styles.infoCard}>
              <Info icon="time-outline" text={formatMeetupTime(t.start_at)} />
              {t.registration_deadline ? (
                <Info icon="hourglass-outline" text={`접수 마감 ${formatMeetupTime(t.registration_deadline)}`} />
              ) : null}
              <Info icon="location-outline" text={`${t.venue || '장소 미정'}${t.region ? ` · ${t.region}` : ''}`} />
              <Info icon="ribbon-outline" text={`실력 ${skillRangeLabel(t.skill_min, t.skill_max)}`} />
              <Info icon="people-outline" text={`정원 ${t.approved_count}/${t.max_participants}${isDoubles ? '팀' : '명'}`} />
              <Info icon="cash-outline" text={t.fee > 0 ? `참가비 ${t.fee.toLocaleString()}원` : '참가비 무료'} />
            </View>

            {t.description ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>소개</Text>
                <Text style={styles.desc}>{t.description}</Text>
              </View>
            ) : null}

            {courts.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>코트 {courts.length}면</Text>
                <View style={styles.courtWrap}>
                  {courts.map((c) => (
                    <View key={c.id} style={styles.courtChip}>
                      <Text style={styles.courtName}>{c.name}</Text>
                      <View style={[styles.courtTag, { backgroundColor: c.indoor ? 'rgba(56,132,255,0.14)' : 'rgba(245,166,35,0.16)' }]}>
                        <Text style={[styles.courtTagText, { color: c.indoor ? '#2D6BD6' : '#7A4E00' }]}>
                          {c.indoor ? '실내' : '실외'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                참가자 {q ? `${approvedShown.length}/${approved.length}` : approved.length}{isDoubles ? '팀' : '명'}
              </Text>
              <View style={{ gap: 10, marginTop: 8 }}>
                {approved.length === 0 ? (
                  <Text style={styles.mutedText}>아직 확정된 참가자가 없어요.</Text>
                ) : approvedShown.length === 0 ? (
                  <Text style={styles.mutedText}>검색 결과가 없어요.</Text>
                ) : (
                  approvedShown.map((e) => (
                    <View key={e.user_id} style={styles.pRow}>
                      <Avatar nickname={e.profiles?.nickname ?? '?'} uri={e.profiles?.avatar_url} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pName}>
                          {e.profiles?.nickname ?? '알 수 없음'}
                          {isDoubles && (e.partner?.nickname ?? e.partner_name)
                            ? ` / ${e.partner?.nickname ?? e.partner_name}`
                            : ''}
                        </Text>
                        <Text style={styles.pMeta}>{e.profiles?.region || '지역 미설정'}</Text>
                      </View>
                      {e.profiles ? (
                        <Text style={styles.pSkill}>
                          {e.profiles.skill_level.toFixed(1)} {skillLabel(e.profiles.skill_level)}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </View>

            {/* 조추첨 미공개 (선수) */}
            {drawGenerated && !drawRevealed && drawRevealAt && (
              <View style={styles.revealBox}>
                <Ionicons name="lock-closed-outline" size={20} color="#6B7280" />
                <Text style={styles.revealText}>조추첨은 {formatMeetupTime(drawRevealAt.toISOString())}에 공개돼요</Text>
              </View>
            )}

            {/* 내 경기 (대진 편성 시 정보 탭에 요약) */}
            {drawRevealed && myMatches.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.subLabelPrimary}>내 경기</Text>
                <View style={{ gap: 6, marginTop: 6 }}>
                  {myMatches.map((m) => (
                    <MatchRow key={m.id} m={m} nameOf={nameOf} uid={uid} highlight courtLabel={courtLabelOf(m.court_id)} avatarOf={avatarOf} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* 예선 (조별리그) */}
        {hasBracket && tab === 'prelim' && (
          <View style={styles.section}>
            {groupNos.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupTabRow}>
                {(['all', ...groupNos] as (number | 'all')[]).map((g) => {
                  const active = groupTab === g;
                  return (
                    <Pressable
                      key={String(g)}
                      onPress={() => setGroupTab(g)}
                      style={[styles.groupPill, active ? styles.groupPillActive : styles.groupPillIdle]}>
                      <Text style={[styles.groupPillText, { color: active ? '#fff' : '#6B7280' }]}>
                        {g === 'all' ? '전체' : `${g}조`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {(q ? groupNos : groupTab === 'all' ? groupNos : groupNos.filter((g) => g === groupTab)).map((gno) => {
              const gms = groupMatchesAll.filter((m) => (m.group_no ?? 1) === gno);
              const table = standings(groupMembers(gms), gms);
              const shownGms = q ? gms.filter(matchHit) : gms;
              if (q && shownGms.length === 0) return null;
              return (
                <View key={`g${gno}`} style={{ marginTop: 14 }}>
                  <Text style={styles.subLabel}>{gno}조 순위</Text>
                  <View style={styles.tableCard}>
                    {table.map((s, i) => (
                      <View key={s.id} style={[styles.standRow, i > 0 && styles.standRowDivider]}>
                        <Text style={styles.standRank}>{i + 1}</Text>
                        <Text style={styles.standName} numberOfLines={1}>{nameOf(s.id)}</Text>
                        <Text style={styles.standStat}>{s.wins}승</Text>
                        <Text style={styles.standStatMuted}>{s.diff > 0 ? `+${s.diff}` : s.diff}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ gap: 6, marginTop: 6 }}>
                    {shownGms.map((m) => (
                      <MatchRow key={m.id} m={m} nameOf={nameOf} uid={uid} courtLabel={courtLabelOf(m.court_id)} avatarOf={avatarOf} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 본선 (토너먼트) */}
        {hasBracket && tab === 'final' && (
          <View style={styles.section}>
            {q ? <Text style={[styles.pMeta, { marginBottom: 6 }]}>검색어와 일치하는 선수를 강조 표시해요.</Text> : null}
            <BracketTree matches={koMatches} nameOf={nameOf} uid={uid} highlightQuery={q} avatarOf={avatarOf} />
          </View>
        )}

        {/* 복식 파트너 검색·선택 (미신청 + 파트너로도 미등록 + 접수중일 때) */}
        {(!hasBracket || tab === 'info') && canRegister && !myEntry && !iAmPartner && isDoubles && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>파트너 선택 (복식)</Text>
            {partnerSel ? (
              <View style={styles.partnerChip}>
                <Avatar nickname={partnerSel.nickname} uri={partnerSel.avatar_url} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.pName}>{partnerSel.nickname}</Text>
                  <Text style={styles.pMeta}>
                    {partnerSel.region || '지역 미설정'} · {partnerSel.skill_level.toFixed(1)} {skillLabel(partnerSel.skill_level)}
                  </Text>
                </View>
                <Text
                  onPress={() => {
                    setPartnerSel(null);
                    setPartnerQuery('');
                  }}
                  style={styles.partnerClear}>
                  변경
                </Text>
              </View>
            ) : (
              <>
                <TextField
                  label="파트너 이름으로 검색"
                  value={partnerQuery}
                  onChangeText={setPartnerQuery}
                  placeholder="닉네임 입력 후 목록에서 선택"
                  autoCapitalize="none"
                />
                {searching ? (
                  <Text style={[styles.pMeta, { marginTop: 6 }]}>검색 중…</Text>
                ) : partnerQuery.trim().length > 0 && partnerResults.length === 0 ? (
                  <View style={styles.partnerNotice}>
                    <Ionicons name="alert-circle-outline" size={16} color="#6B7280" />
                    <Text style={[styles.pMeta, { flex: 1 }]}>
                      가입되지 않은 회원이에요. 앱에 가입된 회원만 파트너로 지정할 수 있어요.
                    </Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 6, gap: 6 }}>
                    {partnerResults.map((p) => (
                      <Pressable key={p.id} onPress={() => setPartnerSel(p)} style={styles.partnerRow}>
                        <Avatar nickname={p.nickname} uri={p.avatar_url} size={34} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.pName}>{p.nickname}</Text>
                          <Text style={styles.pMeta}>
                            {p.region || '지역 미설정'} · {p.skill_level.toFixed(1)} {skillLabel(p.skill_level)}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      <View style={styles.actionBar}>
        {myEntry ? (
          <View style={{ gap: 8 }}>
            <View style={styles.statusRow}>
              <Ionicons
                name={myEntry.status === 'approved' ? 'checkmark-circle' : 'time'}
                size={18}
                color={myEntry.status === 'approved' ? '#16C784' : '#6B7280'}
              />
              <Text style={styles.statusText}>
                {myEntry.status === 'waitlist' ? `대기 ${myWaitlistRank}번` : ENTRY_LABEL[myEntry.status]}
              </Text>
            </View>
            {/* 출전 신고 (승인 + 대회 당일) */}
            {myEntry.status === 'approved' &&
              isEventDay &&
              (checkedIn ? (
                <View style={styles.statusRow}>
                  <Ionicons name="checkmark-done-circle" size={18} color="#16C784" />
                  <Text style={[styles.statusText, { color: '#16C784' }]}>출전 신고 완료</Text>
                </View>
              ) : (
                <Button title="출전 신고" onPress={checkIn} loading={acting} />
              ))}
            {myEntry.status !== 'rejected' && (
              <Button title={myEntry.status === 'waitlist' ? '대기 취소' : '참가 신청 취소'} variant="outline" onPress={confirmCancel} loading={acting} />
            )}
          </View>
        ) : iAmPartner ? (
          <View style={styles.statusRow}>
            <Ionicons name="people" size={18} color="#16C784" />
            <Text style={styles.statusText}>{iAmPartner.profiles?.nickname ?? '상대'}님의 파트너로 참가 신청됨</Text>
          </View>
        ) : canRegister ? (
          <Button title={slotsFull ? '대기 신청하기' : '참가 신청하기'} onPress={confirmApply} loading={acting} />
        ) : (
          <Button title="접수가 마감되었어요" variant="secondary" disabled onPress={() => {}} />
        )}
      </View>
    </SafeAreaView>
  );
}

function Info({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color="#16C784" />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

// 경기 한 건: 양쪽 이름 + 점수(완료 시), 승자 강조, 내 경기 하이라이트
function MatchRow({
  m,
  nameOf,
  uid,
  highlight = false,
  courtLabel,
  avatarOf,
}: {
  m: TournamentMatch;
  nameOf: (id: string | null) => string;
  uid: string | undefined;
  highlight?: boolean;
  courtLabel?: string;
  avatarOf?: (id: string | null) => { uri: string | null; nickname: string } | null;
}) {
  const done = m.status === 'done';
  const w1 = done && !!m.winner_id && m.winner_id === m.entry1_id;
  const w2 = done && !!m.winner_id && m.winner_id === m.entry2_id;
  const mine = highlight || m.entry1_id === uid || m.entry2_id === uid;
  return (
    <View style={[styles.matchRow, { borderColor: mine ? '#16C784' : '#E5E7EB' }]}>
      <View style={{ flex: 1, gap: 4 }}>
        {[
          { id: m.entry1_id, score: m.score1, win: w1 },
          { id: m.entry2_id, score: m.score2, win: w2 },
        ].map((side, i) => {
          const av = avatarOf?.(side.id);
          return (
            <View key={i} style={styles.matchSide}>
              <View style={styles.matchNameWrap}>
                {av ? <Avatar nickname={av.nickname} uri={av.uri} size={22} /> : null}
                <Text style={[styles.matchName, { fontWeight: side.win ? '800' : '500' }]} numberOfLines={1}>
                  {nameOf(side.id)}
                </Text>
              </View>
              <Text style={[styles.matchScore, { color: side.win ? '#16C784' : '#6B7280' }]}>
                {done ? side.score ?? 0 : '·'}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {courtLabel ? (
          <View style={styles.matchCourt}>
            <Text style={styles.matchCourtText}>🏟 {courtLabel}</Text>
          </View>
        ) : null}
        {!done && <Text style={styles.matchTag}>예정</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F7F9' },
  notFound: { color: '#6B7280', fontSize: 15 },
  mutedText: { color: '#6B7280', fontSize: 14 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.four },
  headerArea: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.three, gap: 10 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingHorizontal: Spacing.four },
  tabItem: { marginRight: 22, paddingTop: 8, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '700' },
  tabUnderline: { height: 2.5, alignSelf: 'stretch', marginTop: 8, borderRadius: 2 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: Spacing.three,
    gap: 12,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, fontWeight: '500', color: '#111827', flex: 1 },
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  desc: { fontSize: 15, lineHeight: 22, color: '#6B7280', marginTop: 6 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  pMeta: { fontSize: 13, color: '#6B7280', marginTop: 1 },
  pSkill: { fontSize: 13, fontWeight: '700', color: '#16C784' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#F6F7F9' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  statusText: { fontSize: 15, fontWeight: '700', color: '#111827' },
  partnerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#16C784',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  partnerClear: { fontSize: 14, fontWeight: '700', color: '#16C784', paddingHorizontal: 6, paddingVertical: 4 },
  partnerNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  courtWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  courtChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 999, paddingLeft: 12, paddingRight: 8, paddingVertical: 6 },
  courtName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  courtTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  courtTagText: { fontSize: 12, fontWeight: '700' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', paddingVertical: 0 },
  groupTabRow: { gap: 8, paddingBottom: 4 },
  groupPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  groupPillActive: { backgroundColor: '#16C784' },
  groupPillIdle: { backgroundColor: '#F0F1F3' },
  groupPillText: { fontSize: 14, fontWeight: '700' },
  revealBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, marginTop: Spacing.two },
  revealText: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  subLabel: { fontSize: 14, fontWeight: '700', color: '#6B7280', marginTop: 2 },
  subLabelPrimary: { fontSize: 14, fontWeight: '800', color: '#16C784', marginTop: 2 },
  tableCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, marginTop: 6, overflow: 'hidden' },
  standRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, gap: 8 },
  standRowDivider: { borderTopColor: '#F1F3F5', borderTopWidth: 1 },
  standRank: { width: 18, fontSize: 13, fontWeight: '700', color: '#6B7280', textAlign: 'center' },
  standName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  standStat: { width: 44, fontSize: 13, fontWeight: '600', color: '#111827', textAlign: 'right' },
  standStatMuted: { width: 44, fontSize: 13, fontWeight: '600', color: '#6B7280', textAlign: 'right' },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  matchSide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  matchNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchName: { flex: 1, fontSize: 14, color: '#111827' },
  matchScore: { fontSize: 15, fontWeight: '800', minWidth: 18, textAlign: 'right' },
  matchTag: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  matchCourt: { backgroundColor: '#F0F1F3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  matchCourtText: { fontSize: 11, fontWeight: '700', color: '#6B7280' },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 8,
  },
});
