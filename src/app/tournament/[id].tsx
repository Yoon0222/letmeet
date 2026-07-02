import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useLoading } from '@/contexts/loading';
import { useTheme } from '@/hooks/use-theme';
import { groupMembers, standings } from '@/lib/bracket';
import { formatMeetupTime, skillLabel, skillRangeLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type {
  EntryStatus,
  PartnerProfile,
  TournamentEntryWithProfile,
  TournamentMatch,
  TournamentWithCounts,
} from '@/lib/types';

const ENTRY_LABEL: Record<EntryStatus, string> = {
  pending: '승인 대기중',
  approved: '참가 확정',
  rejected: '거절됨',
  withdrawn: '철회됨',
};

export default function TournamentDetail() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { show, hide } = useLoading();
  const uid = session?.user.id;

  const [t, setT] = useState<TournamentWithCounts | null>(null);
  const [entries, setEntries] = useState<TournamentEntryWithProfile[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // 복식 파트너 검색/선택
  const [partnerQuery, setPartnerQuery] = useState('');
  const [partnerResults, setPartnerResults] = useState<PartnerProfile[]>([]);
  const [partnerSel, setPartnerSel] = useState<PartnerProfile | null>(null);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: tour }, { data: ents }, { data: ms }] = await Promise.all([
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
    ]);
    setT(tour ?? null);
    setEntries((ents as unknown as TournamentEntryWithProfile[]) ?? []);
    setMatches((ms as TournamentMatch[]) ?? []);
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
  const approved = entries.filter((e) => e.status === 'approved');
  const canRegister = t?.status === 'registration';
  const isDoubles = t?.discipline === 'doubles';

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
  const koRounds = [...new Set(koMatches.map((m) => m.round_order ?? 0))].sort((a, b) => a - b);
  const myMatches = matches.filter((m) => m.entry1_id === uid || m.entry2_id === uid);

  // 파트너 이름으로 회원 검색 (동명이인 대비 → 목록에서 선택). 300ms 디바운스.
  useEffect(() => {
    const q = partnerQuery.trim();
    if (partnerSel || q.length < 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPartnerResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, skill_level, avatar_url, region')
        .ilike('nickname', `%${q}%`)
        .neq('id', uid ?? '')
        .limit(8);
      setPartnerResults((data as PartnerProfile[]) ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [partnerQuery, partnerSel, uid]);

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

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (!t) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>대회를 찾을 수 없어요.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

        <Text style={[styles.title, { color: theme.text }]}>{t.title}</Text>

        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Info icon="time-outline" text={formatMeetupTime(t.start_at)} theme={theme} />
          {t.registration_deadline ? (
            <Info icon="hourglass-outline" text={`접수 마감 ${formatMeetupTime(t.registration_deadline)}`} theme={theme} />
          ) : null}
          <Info
            icon="location-outline"
            text={`${t.venue || '장소 미정'}${t.region ? ` · ${t.region}` : ''}`}
            theme={theme}
          />
          <Info icon="ribbon-outline" text={`실력 ${skillRangeLabel(t.skill_min, t.skill_max)}`} theme={theme} />
          <Info icon="people-outline" text={`정원 ${t.approved_count}/${t.max_participants}명`} theme={theme} />
          <Info icon="cash-outline" text={t.fee > 0 ? `참가비 ${t.fee.toLocaleString()}원` : '참가비 무료'} theme={theme} />
        </View>

        {t.description ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>소개</Text>
            <Text style={[styles.desc, { color: theme.textSecondary }]}>{t.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>참가자 {approved.length}명</Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            {approved.length === 0 ? (
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>아직 확정된 참가자가 없어요.</Text>
            ) : (
              approved.map((e) => (
                <View key={e.user_id} style={styles.pRow}>
                  <Avatar nickname={e.profiles?.nickname ?? '?'} uri={e.profiles?.avatar_url} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pName, { color: theme.text }]}>
                      {e.profiles?.nickname ?? '알 수 없음'}
                      {isDoubles && (e.partner?.nickname ?? e.partner_name)
                        ? ` / ${e.partner?.nickname ?? e.partner_name}`
                        : ''}
                    </Text>
                    <Text style={[styles.pMeta, { color: theme.textSecondary }]}>
                      {e.profiles?.region || '지역 미설정'}
                    </Text>
                  </View>
                  {e.profiles ? (
                    <Text style={[styles.pSkill, { color: theme.primary }]}>
                      {e.profiles.skill_level.toFixed(1)} {skillLabel(e.profiles.skill_level)}
                    </Text>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </View>

        {/* 대진표 (경기가 편성된 경우) */}
        {matches.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>대진표</Text>

            {myMatches.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.subLabel, { color: theme.primary }]}>내 경기</Text>
                <View style={{ gap: 6, marginTop: 6 }}>
                  {myMatches.map((m) => (
                    <MatchRow key={m.id} m={m} nameOf={nameOf} uid={uid} theme={theme} highlight />
                  ))}
                </View>
              </View>
            )}

            {groupNos.map((gno) => {
              const gms = groupMatchesAll.filter((m) => (m.group_no ?? 1) === gno);
              const table = standings(groupMembers(gms), gms);
              return (
                <View key={`g${gno}`} style={{ marginTop: 14 }}>
                  <Text style={[styles.subLabel, { color: theme.textSecondary }]}>{gno}조 순위</Text>
                  <View style={[styles.tableCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    {table.map((s, i) => (
                      <View
                        key={s.id}
                        style={[styles.standRow, i > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
                        <Text style={[styles.standRank, { color: theme.textSecondary }]}>{i + 1}</Text>
                        <Text style={[styles.standName, { color: theme.text }]} numberOfLines={1}>
                          {nameOf(s.id)}
                        </Text>
                        <Text style={[styles.standStat, { color: theme.text }]}>{s.wins}승</Text>
                        <Text style={[styles.standStat, { color: theme.textSecondary }]}>
                          {s.diff > 0 ? `+${s.diff}` : s.diff}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ gap: 6, marginTop: 6 }}>
                    {gms.map((m) => (
                      <MatchRow key={m.id} m={m} nameOf={nameOf} uid={uid} theme={theme} />
                    ))}
                  </View>
                </View>
              );
            })}

            {koRounds.map((ro) => {
              const rms = koMatches.filter((m) => (m.round_order ?? 0) === ro);
              return (
                <View key={`r${ro}`} style={{ marginTop: 14 }}>
                  <Text style={[styles.subLabel, { color: theme.textSecondary }]}>
                    {rms[0]?.round_name || '토너먼트'}
                  </Text>
                  <View style={{ gap: 6, marginTop: 6 }}>
                    {rms.map((m) => (
                      <MatchRow key={m.id} m={m} nameOf={nameOf} uid={uid} theme={theme} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 복식 파트너 검색·선택 (미신청 + 접수중일 때) */}
        {canRegister && !myEntry && isDoubles && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>파트너 선택 (복식)</Text>
            {partnerSel ? (
              <View style={[styles.partnerChip, { backgroundColor: theme.card, borderColor: theme.primary }]}>
                <Avatar nickname={partnerSel.nickname} uri={partnerSel.avatar_url} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pName, { color: theme.text }]}>{partnerSel.nickname}</Text>
                  <Text style={[styles.pMeta, { color: theme.textSecondary }]}>
                    {partnerSel.region || '지역 미설정'} · {partnerSel.skill_level.toFixed(1)} {skillLabel(partnerSel.skill_level)}
                  </Text>
                </View>
                <Text
                  onPress={() => {
                    setPartnerSel(null);
                    setPartnerQuery('');
                  }}
                  style={[styles.partnerClear, { color: theme.primary }]}>
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
                  <Text style={[styles.pMeta, { color: theme.textSecondary, marginTop: 6 }]}>검색 중…</Text>
                ) : partnerQuery.trim().length > 0 && partnerResults.length === 0 ? (
                  <View style={[styles.partnerNotice, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Ionicons name="alert-circle-outline" size={16} color={theme.textSecondary} />
                    <Text style={[styles.pMeta, { color: theme.textSecondary, flex: 1 }]}>
                      가입되지 않은 회원이에요. 앱에 가입된 회원만 파트너로 지정할 수 있어요.
                    </Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 6, gap: 6 }}>
                    {partnerResults.map((p) => (
                      <Pressable
                        key={p.id}
                        onPress={() => setPartnerSel(p)}
                        style={[styles.partnerRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                        <Avatar nickname={p.nickname} uri={p.avatar_url} size={34} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pName, { color: theme.text }]}>{p.nickname}</Text>
                          <Text style={[styles.pMeta, { color: theme.textSecondary }]}>
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

      <View style={[styles.actionBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        {myEntry ? (
          <View style={{ gap: 8 }}>
            <View style={styles.statusRow}>
              <Ionicons
                name={myEntry.status === 'approved' ? 'checkmark-circle' : 'time'}
                size={18}
                color={myEntry.status === 'approved' ? theme.primary : theme.textSecondary}
              />
              <Text style={[styles.statusText, { color: theme.text }]}>{ENTRY_LABEL[myEntry.status]}</Text>
            </View>
            {myEntry.status !== 'rejected' && (
              <Button title="참가 신청 취소" variant="outline" onPress={confirmCancel} loading={acting} />
            )}
          </View>
        ) : canRegister ? (
          <Button title="참가 신청하기" onPress={apply} loading={acting} />
        ) : (
          <Button title="접수가 마감되었어요" variant="secondary" disabled onPress={() => {}} />
        )}
      </View>
    </SafeAreaView>
  );
}

function Info({
  icon,
  text,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={theme.primary} />
      <Text style={[styles.infoText, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

// 경기 한 건: 양쪽 이름 + 점수(완료 시), 승자 강조, 내 경기 하이라이트
function MatchRow({
  m,
  nameOf,
  uid,
  theme,
  highlight = false,
}: {
  m: TournamentMatch;
  nameOf: (id: string | null) => string;
  uid: string | undefined;
  theme: ReturnType<typeof useTheme>;
  highlight?: boolean;
}) {
  const done = m.status === 'done';
  const w1 = done && !!m.winner_id && m.winner_id === m.entry1_id;
  const w2 = done && !!m.winner_id && m.winner_id === m.entry2_id;
  const mine = highlight || m.entry1_id === uid || m.entry2_id === uid;
  return (
    <View
      style={[
        styles.matchRow,
        { backgroundColor: theme.card, borderColor: mine ? theme.primary : theme.border },
      ]}>
      <View style={{ flex: 1, gap: 4 }}>
        {[
          { id: m.entry1_id, score: m.score1, win: w1 },
          { id: m.entry2_id, score: m.score2, win: w2 },
        ].map((side, i) => (
          <View key={i} style={styles.matchSide}>
            <Text
              style={[styles.matchName, { color: theme.text, fontWeight: side.win ? '800' : '500' }]}
              numberOfLines={1}>
              {nameOf(side.id)}
            </Text>
            <Text
              style={[styles.matchScore, { color: side.win ? theme.primary : theme.textSecondary }]}>
              {done ? side.score ?? 0 : '·'}
            </Text>
          </View>
        ))}
      </View>
      {!done && <Text style={[styles.matchTag, { color: theme.textSecondary }]}>예정</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.four },
  badgeRow: { flexDirection: 'row', gap: 6 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  infoCard: { borderRadius: 16, borderWidth: 1, padding: Spacing.three, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, fontWeight: '500', flex: 1 },
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  desc: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pName: { fontSize: 15, fontWeight: '700' },
  pMeta: { fontSize: 13, marginTop: 1 },
  pSkill: { fontSize: 13, fontWeight: '700' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  statusText: { fontSize: 15, fontWeight: '700' },
  partnerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  partnerClear: { fontSize: 14, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 4 },
  partnerNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  subLabel: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  tableCard: { borderWidth: 1, borderRadius: 12, marginTop: 6, overflow: 'hidden' },
  standRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, gap: 8 },
  standRank: { width: 18, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  standName: { flex: 1, fontSize: 14, fontWeight: '600' },
  standStat: { width: 44, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  matchSide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  matchName: { flex: 1, fontSize: 14 },
  matchScore: { fontSize: 15, fontWeight: '800', minWidth: 18, textAlign: 'right' },
  matchTag: { fontSize: 12, fontWeight: '600' },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
  },
});
