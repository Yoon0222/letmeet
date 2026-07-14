import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { TeamLineup } from '@/components/team-lineup';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { PartnerProfile, TournamentTeamWithMembers, TournamentWithCounts } from '@/lib/types';

// 단체전 팀 신청/관리 — 주장이 팀명 + 가입 유저 검색해 팀 단위로 신청한다.
export function TeamRegister({
  tournament,
  uid,
  onChange,
}: {
  tournament: TournamentWithCounts;
  uid: string | undefined;
  onChange?: () => void;
}) {
  const id = tournament.id;
  const canRegister = tournament.status === 'registration';
  const minSize = tournament.team_min_size || 2; // 뷰 반영 전 대비 기본값

  const [teams, setTeams] = useState<TournamentTeamWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // 팀 만들기 상태
  const [teamName, setTeamName] = useState('');
  const [picked, setPicked] = useState<PartnerProfile[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PartnerProfile[]>([]);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('tournament_teams')
      .select('*, members:tournament_team_members(user_id, profiles(id, nickname, skill_level, avatar_url, region))')
      .eq('tournament_id', id)
      .order('created_at', { ascending: true });
    setTeams((data as unknown as TournamentTeamWithMembers[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const myTeam = teams.find((t) => t.captain_id === uid || t.members.some((m) => m.user_id === uid));
  const isCaptain = myTeam?.captain_id === uid;
  const approvedTeams = teams.filter((t) => t.status === 'approved');

  // 이미 이 대회 팀에 속한 유저(주장·팀원)는 검색에서 제외
  const takenIds = new Set<string>(teams.flatMap((t) => [t.captain_id, ...t.members.map((m) => m.user_id)]));

  // 팀원 검색 (닉네임, 300ms 디바운스)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, skill_level, avatar_url, region')
        .ilike('nickname', `%${q}%`)
        .neq('id', uid ?? '')
        .limit(16);
      const pickedIds = new Set(picked.map((p) => p.id));
      const list = ((data as PartnerProfile[]) ?? [])
        .filter((p) => !takenIds.has(p.id) && !pickedIds.has(p.id))
        .slice(0, 8);
      setResults(list);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
    // takenIds/picked 는 매 렌더 새 객체라 query/uid 변화에만 반응하도록 의존성 최소화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, uid]);

  async function submitTeam() {
    if (!uid) return;
    if (!teamName.trim()) {
      Alert.alert('팀 이름', '팀 이름을 입력해주세요.');
      return;
    }
    // 주장 포함 인원
    const totalSize = picked.length + 1;
    if (totalSize < minSize) {
      Alert.alert('최소 인원 부족', `이 대회는 팀당 최소 ${minSize}명이 필요해요. (현재 주장 포함 ${totalSize}명)`);
      return;
    }
    setActing(true);
    const { data: team, error } = await supabase
      .from('tournament_teams')
      .insert({ tournament_id: id, name: teamName.trim(), captain_id: uid })
      .select('id')
      .single();
    if (error || !team) {
      setActing(false);
      Alert.alert('팀 신청 실패', error?.message ?? '다시 시도해주세요.');
      return;
    }
    // 주장 + 선택한 팀원 등록
    const rows = [{ team_id: team.id, user_id: uid }, ...picked.map((p) => ({ team_id: team.id, user_id: p.id }))];
    const { error: memErr } = await supabase.from('tournament_team_members').insert(rows);
    setActing(false);
    if (memErr) {
      Alert.alert('팀원 등록 실패', memErr.message);
      return;
    }
    Alert.alert('팀 신청 완료', '주최자 승인 후 참가가 확정돼요.');
    setTeamName('');
    setPicked([]);
    setQuery('');
    load();
  }

  function confirmCancel() {
    if (!myTeam) return;
    Alert.alert('팀 신청 취소', `'${myTeam.name}' 팀 신청을 취소할까요?`, [
      { text: '닫기', style: 'cancel' },
      {
        text: '신청 취소',
        style: 'destructive',
        onPress: async () => {
          setActing(true);
          await supabase.from('tournament_teams').delete().eq('id', myTeam.id);
          setActing(false);
          load();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={{ paddingVertical: Spacing.four }}>
        <ActivityIndicator color="#16C784" />
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.three }}>
      {/* 내 팀이 있으면: 상태 + 팀원, 없으면: 팀 만들기 */}
      {myTeam ? (
        <View style={styles.section}>
          <View style={styles.myTeamHead}>
            <Text style={styles.sectionTitle}>내 팀 · {myTeam.name}</Text>
            <Badge
              label={myTeam.status === 'approved' ? '참가 확정' : myTeam.status === 'rejected' ? '거절됨' : '승인 대기'}
              color={myTeam.status === 'approved' ? '#16A34A' : myTeam.status === 'rejected' ? '#E5484D' : '#B45309'}
              bg={myTeam.status === 'approved' ? 'rgba(22,163,74,0.12)' : myTeam.status === 'rejected' ? 'rgba(229,72,77,0.12)' : 'rgba(245,158,11,0.14)'}
            />
          </View>
          <Text style={styles.mutedSmall}>
            {isCaptain ? '내가 주장이에요.' : '팀원으로 참가해요.'} · {myTeam.members.length}명
          </Text>
          <View style={{ gap: 10, marginTop: 10 }}>
            {myTeam.members.map((m) => (
              <View key={m.user_id} style={styles.mRow}>
                <Avatar nickname={m.profiles?.nickname ?? '?'} uri={m.profiles?.avatar_url} size={38} />
                <View style={{ flex: 1 }}>
                  <View style={styles.mNameRow}>
                    <Text style={styles.mName}>{m.profiles?.nickname ?? '알 수 없음'}</Text>
                    {m.user_id === myTeam.captain_id && <Badge label="주장" color="#2D7FF9" bg="rgba(45,127,249,0.14)" />}
                  </View>
                  <Text style={styles.mMeta}>{m.profiles?.region || '지역 미설정'}</Text>
                </View>
              </View>
            ))}
          </View>
          {isCaptain && canRegister && myTeam.status !== 'approved' ? (
            <Button title="팀 신청 취소" variant="outline" onPress={confirmCancel} loading={acting} style={{ marginTop: Spacing.two }} />
          ) : null}
          {/* 주장: 확정 팀이면 오더(라인업) 배정 */}
          {isCaptain && myTeam.status === 'approved' ? <TeamLineup team={myTeam} onChange={onChange} /> : null}
        </View>
      ) : canRegister ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>팀으로 참가 신청</Text>
          <Text style={styles.mutedSmall}>팀 이름을 정하고, 함께 뛸 팀원(가입 회원)을 검색해 추가하세요. 팀당 최소 {minSize}명.</Text>
          <View style={{ marginTop: 10, gap: 10 }}>
            <TextField label="팀 이름" value={teamName} onChangeText={setTeamName} placeholder="예: 송파 파이터스" maxLength={20} />

            {/* 선택된 팀원 */}
            {picked.length > 0 ? (
              <View style={{ gap: 8 }}>
                {picked.map((p) => (
                  <View key={p.id} style={styles.mRow}>
                    <Avatar nickname={p.nickname} uri={p.avatar_url} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mName}>{p.nickname}</Text>
                      <Text style={styles.mMeta}>{p.region || '지역 미설정'} · {p.skill_level.toFixed(1)} {skillLabel(p.skill_level)}</Text>
                    </View>
                    <Text onPress={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))} style={styles.removeBtn}>제거</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <TextField label="팀원 검색" value={query} onChangeText={setQuery} placeholder="닉네임 입력 후 목록에서 추가" autoCapitalize="none" />
            {searching ? (
              <Text style={styles.mutedSmall}>검색 중…</Text>
            ) : query.trim().length > 0 && results.length === 0 ? (
              <View style={styles.notice}>
                <Ionicons name="alert-circle-outline" size={16} color="#6B7280" />
                <Text style={[styles.mMeta, { flex: 1 }]}>추가할 수 있는 회원이 없어요. (가입 회원만, 이미 다른 팀이면 제외)</Text>
              </View>
            ) : (
              <View style={{ gap: 6 }}>
                {results.map((p) => (
                  <Pressable key={p.id} onPress={() => { setPicked((prev) => [...prev, p]); setQuery(''); }} style={styles.pickRow}>
                    <Avatar nickname={p.nickname} uri={p.avatar_url} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.mName}>{p.nickname}</Text>
                      <Text style={styles.mMeta}>{p.region || '지역 미설정'} · {p.skill_level.toFixed(1)} {skillLabel(p.skill_level)}</Text>
                    </View>
                    <Ionicons name="add-circle" size={22} color="#16C784" />
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.mutedSmall}>주장(나) 포함 {picked.length + 1}명 / 최소 {minSize}명</Text>
            <Button title="팀 신청하기" onPress={submitTeam} loading={acting} disabled={picked.length + 1 < minSize} />
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.mutedSmall}>접수가 마감되어 팀 신청을 받지 않아요.</Text>
        </View>
      )}

      {/* 참가 팀 목록 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>참가 팀 {approvedTeams.length}팀</Text>
        <View style={{ gap: 12, marginTop: 8 }}>
          {approvedTeams.length === 0 ? (
            <Text style={styles.mutedSmall}>아직 확정된 팀이 없어요.</Text>
          ) : (
            approvedTeams.map((team) => (
              <View key={team.id} style={styles.teamCard}>
                <Text style={styles.teamName}>{team.name}</Text>
                <Text style={styles.mMeta}>
                  {team.members.map((m) => m.profiles?.nickname ?? '?').join(', ')} · {team.members.length}명
                </Text>
              </View>
            ))
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  mutedSmall: { fontSize: 13, color: '#6B7280', marginTop: 4, lineHeight: 19 },
  myTeamHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  mMeta: { fontSize: 13, color: '#6B7280', marginTop: 1 },
  removeBtn: { fontSize: 13, fontWeight: '700', color: '#E5484D', paddingHorizontal: 8, paddingVertical: 6 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 10 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 8 },
  teamCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, borderCurve: 'continuous', padding: Spacing.three },
  teamName: { fontSize: 16, fontWeight: '800', color: '#111827' },
});
