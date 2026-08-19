import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';

import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { ClubSessionMatch, PartnerProfile } from '@/lib/types';

export default function SessionScore() {
  const router = useRouter();
  const { matchId, target } = useLocalSearchParams<{ matchId: string; target?: string }>();
  const pointTarget = Math.max(1, parseInt(target ?? '16', 10) || 16);

  const [match, setMatch] = useState<ClubSessionMatch | null>(null);
  const [profiles, setProfiles] = useState<Map<string, PartnerProfile>>(new Map());
  const [score1, setScore1] = useState(0);
  const [score2, setScore2] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!matchId) return;
    (async () => {
      const { data } = await supabase.from('club_session_matches').select('*').eq('id', matchId).maybeSingle();
      const m = data as ClubSessionMatch | null;
      if (!m) { setLoading(false); return; }
      const ids = [m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2].filter(Boolean) as string[];
      const { data: profs } = await supabase.from('profiles').select('id, nickname, skill_level, avatar_url, region').in('id', ids);
      setProfiles(new Map(((profs as PartnerProfile[] | null) ?? []).map((p) => [p.id, p])));
      setScore1(m.team1_score);
      setScore2(m.team2_score);
      setMatch(m);
      setLoading(false);
    })();
  }, [matchId]);

  const name = (pid: string | null) => (pid ? profiles.get(pid)?.nickname ?? '?' : '');

  async function save() {
    if (!match) return;
    if (score1 === score2) { Alert.alert('점수 확인', '무승부는 기록할 수 없어요. 점수를 확인해주세요.'); return; }
    setSaving(true);
    const { error } = await supabase
      .from('club_session_matches')
      .update({ team1_score: score1, team2_score: score2, status: 'done' })
      .eq('id', match.id);
    setSaving(false);
    if (error) { Alert.alert('저장 실패', error.message); return; }
    router.back();
  }

  if (loading) return <View style={styles.center}><Text style={styles.dim}>불러오는 중…</Text></View>;
  if (!match) return <View style={styles.center}><Text style={styles.dim}>경기를 찾을 수 없어요.</Text></View>;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>목표 {pointTarget}점 · 이긴 팀 점수가 더 높게 입력하세요.</Text>

      <TeamScore label={`${name(match.team1_player1)} · ${name(match.team1_player2)}`} value={score1} onChange={setScore1} max={pointTarget} />
      <View style={styles.vs}><Text style={styles.vsTxt}>VS</Text></View>
      <TeamScore label={`${name(match.team2_player1)} · ${name(match.team2_player2)}`} value={score2} onChange={setScore2} max={pointTarget} />

      <Button title="결과 저장" onPress={save} loading={saving} style={{ marginTop: Spacing.four }} />
    </ScrollView>
  );
}

function TeamScore({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  return (
    <View style={styles.teamCard}>
      <Text style={styles.teamName} numberOfLines={1}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => onChange(Math.max(0, value - 1))} style={styles.stepBtn}>
          <Ionicons name="remove" size={22} color="#F8FAFC" />
        </Pressable>
        <Text style={styles.scoreVal}>{value}</Text>
        <Pressable onPress={() => onChange(Math.min(99, value + 1))} style={styles.stepBtn}>
          <Ionicons name="add" size={22} color="#F8FAFC" />
        </Pressable>
      </View>
      <Pressable onPress={() => onChange(max)} style={styles.maxBtn}>
        <Text style={styles.maxTxt}>{max}점 (목표 달성)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  dim: { color: '#AAB4C0', fontSize: 14 },
  content: { padding: Spacing.four, gap: Spacing.three },
  hint: { color: '#AAB4C0', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  teamCard: { borderRadius: 20, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', padding: Spacing.three, gap: 14, alignItems: 'center' },
  teamName: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  stepBtn: { width: 52, height: 52, borderRadius: 16, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: '#151D25' },
  scoreVal: { color: '#16C784', fontSize: 40, fontWeight: '900', minWidth: 70, textAlign: 'center' },
  maxBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(22,199,132,0.12)' },
  maxTxt: { color: '#16C784', fontSize: 13, fontWeight: '700' },
  vs: { alignItems: 'center' },
  vsTxt: { color: '#707B87', fontSize: 14, fontWeight: '900' },
});
