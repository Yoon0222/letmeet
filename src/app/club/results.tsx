import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert as Alert } from '@/lib/feedback';

import { Spacing } from '@/constants/theme';
import { submitMatchToDupr } from '@/lib/dupr';
import { supabase } from '@/lib/supabase';
import { useClubAccess } from '@/lib/use-club-access';
import type { ClubMatchResult, ClubMatchResultWithProfiles, PartnerProfile } from '@/lib/types';

export default function ClubResults() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { isPremiumUsable, isOwner, isApprovedMember, canManage, loading: accessLoading } = useClubAccess(clubId);
  const [results, setResults] = useState<ClubMatchResultWithProfiles[]>([]);
  const [duprBusy, setDuprBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clubId) return;
    const { data: r } = await supabase
      .from('club_match_results')
      .select('*')
      .eq('club_id', clubId)
      .order('match_date', { ascending: false })
      .order('created_at', { ascending: false });
    const rows = (r ?? []) as ClubMatchResult[];
    const ids = Array.from(new Set(rows.flatMap((row) => [row.recorded_by, row.team1_player1, row.team1_player2, row.team2_player1, row.team2_player2]).filter(Boolean) as string[]));
    const { data: profiles } = ids.length
      ? await supabase.from('profiles').select('id, nickname, skill_level, avatar_url, region').in('id', ids)
      : { data: [] };
    const map = new Map((profiles as PartnerProfile[] | null ?? []).map((p) => [p.id, p]));
    setResults(rows.map((row) => ({
      ...row,
      team1Player1: map.get(row.team1_player1) ?? null,
      team1Player2: row.team1_player2 ? map.get(row.team1_player2) ?? null : null,
      team2Player1: map.get(row.team2_player1) ?? null,
      team2Player2: row.team2_player2 ? map.get(row.team2_player2) ?? null : null,
      recorder: map.get(row.recorded_by) ?? null,
    })));
    setLoading(false);
  }, [clubId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function registerDupr(result: ClubMatchResultWithProfiles) {
    if (!canManage || duprBusy) return;
    setDuprBusy(result.id);
    const isDoubles = !!result.team1_player2 || !!result.team2_player2;
    const res = await submitMatchToDupr({
      source: 'club',
      match_id: result.id,
      format: isDoubles ? 'doubles' : 'singles',
      teamA: { p1: result.team1_player1, p2: result.team1_player2 ?? undefined },
      teamB: { p1: result.team2_player1, p2: result.team2_player2 ?? undefined },
      games: [{ a: result.team1_score, b: result.team2_score }],
      match_date: result.match_date,
    });
    setDuprBusy(null);
    if (!res.ok) {
      if (res.error === 'players_not_connected') Alert.alert('DUPR 등록 불가', '경기에 참여한 모든 선수가 DUPR 연결(인증)돼 있어야 등록할 수 있어요.');
      else if (res.error === 'dupr_not_configured') Alert.alert('DUPR 준비 중', 'DUPR 연동이 아직 준비 중이에요. 잠시 후 다시 시도해 주세요.');
      else Alert.alert('DUPR 등록 실패', res.error ?? '잠시 후 다시 시도해 주세요.');
      return;
    }
    Alert.alert('DUPR 등록 완료', '경기 결과가 DUPR 에 반영됐어요.');
    load();
  }

  if (loading || accessLoading) {
    return <View style={styles.center}><ActivityIndicator color="#16C784" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {isPremiumUsable && (isOwner || isApprovedMember) ? (
          <Pressable onPress={() => router.push({ pathname: '/club/match-create', params: { clubId } })} style={styles.createBtn}>
            <Ionicons name="add" size={18} color="#07100D" />
            <Text style={styles.createTxt}>경기 결과 기록</Text>
          </Pressable>
        ) : null}

        {!isPremiumUsable ? (
          <View style={styles.emptyBox}>
            <Ionicons name="lock-closed-outline" size={20} color="#AAB4C0" />
            <Text style={styles.emptyTxt}>프리미엄 클럽에서 경기 결과를 기록할 수 있어요.</Text>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="podium-outline" size={20} color="#AAB4C0" />
            <Text style={styles.emptyTxt}>아직 기록된 경기 결과가 없어요.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {results.map((result) => {
              const team1Win = result.team1_score > result.team2_score;
              const team2Win = result.team2_score > result.team1_score;
              const team1 = [result.team1Player1?.nickname, result.team1Player2?.nickname].filter(Boolean).join(' / ');
              const team2 = [result.team2Player1?.nickname, result.team2Player2?.nickname].filter(Boolean).join(' / ');
              return (
                <View key={result.id} style={styles.resultCard}>
                  <View style={styles.resultMetaRow}>
                    <Text style={styles.resultDate}>{result.match_date.replaceAll('-', '.')}</Text>
                    <Text style={styles.resultRecorder}>{result.recorder?.nickname ?? '기록자'}</Text>
                  </View>
                  <View style={styles.scoreRow}>
                    <Text style={[styles.teamName, team1Win && styles.winnerName]} numberOfLines={1}>{team1}</Text>
                    <Text style={styles.scoreText}>
                      <Text style={team1Win ? styles.winnerScore : undefined}>{result.team1_score}</Text>
                      <Text> - </Text>
                      <Text style={team2Win ? styles.winnerScore : undefined}>{result.team2_score}</Text>
                    </Text>
                    <Text style={[styles.teamName, team2Win && styles.winnerName]} numberOfLines={1}>{team2}</Text>
                  </View>
                  {result.note ? <Text style={styles.resultNote} numberOfLines={2}>{result.note}</Text> : null}
                  <View style={styles.duprRow}>
                    {result.dupr_status === 'submitted' ? (
                      <View style={styles.duprBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#16C784" />
                        <Text style={styles.duprBadgeText}>DUPR 반영됨</Text>
                      </View>
                    ) : (
                      <Text style={styles.duprHint}>{result.dupr_status === 'failed' ? 'DUPR 등록 실패' : 'DUPR 미등록'}</Text>
                    )}
                    {canManage && result.dupr_status !== 'submitted' ? (
                      <Pressable onPress={() => registerDupr(result)} disabled={duprBusy === result.id} style={styles.duprBtn}>
                        {duprBusy === result.id ? <ActivityIndicator size="small" color="#07100D" /> : <Text style={styles.duprBtnText}>DUPR 등록</Text>}
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  content: { padding: Spacing.four, gap: Spacing.three },
  createBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#16C784', borderRadius: 16, borderCurve: 'continuous' },
  createTxt: { color: '#07100D', fontSize: 15, fontWeight: '900' },
  emptyBox: { minHeight: 80, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.three },
  emptyTxt: { flex: 1, color: '#AAB4C0', fontSize: 14, fontWeight: '700' },
  resultCard: { borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', padding: Spacing.three, gap: 10 },
  resultMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultDate: { color: '#AAB4C0', fontSize: 12, fontWeight: '800' },
  resultRecorder: { color: '#707B87', fontSize: 12, fontWeight: '700' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamName: { flex: 1, color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  winnerName: { color: '#16C784' },
  scoreText: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' },
  winnerScore: { color: '#16C784' },
  resultNote: { color: '#AAB4C0', fontSize: 13, lineHeight: 18 },
  duprRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 2 },
  duprBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  duprBadgeText: { color: '#16C784', fontSize: 12, fontWeight: '800' },
  duprHint: { color: '#707B87', fontSize: 12, fontWeight: '700' },
  duprBtn: { minHeight: 30, minWidth: 84, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16C784', borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 12 },
  duprBtnText: { color: '#07100D', fontSize: 12, fontWeight: '900' },
});
