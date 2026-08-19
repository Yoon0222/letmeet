import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { AppAlert as Alert } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import type { ClubMemberWithProfile, ClubWithCounts } from '@/lib/types';

type Params = {
  clubId?: string;
};

export default function ClubMatchCreate() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<Params>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [club, setClub] = useState<ClubWithCounts | null>(null);
  const [members, setMembers] = useState<ClubMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [team1Player, setTeam1Player] = useState('');
  const [team2Player, setTeam2Player] = useState('');
  const [team1Score, setTeam1Score] = useState('');
  const [team2Score, setTeam2Score] = useState('');
  const [note, setNote] = useState('');
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }
    try {
      const [{ data: c }, { data: m }] = await Promise.all([
        supabase.from('clubs_with_counts').select('*').eq('id', clubId).maybeSingle(),
        supabase
          .from('club_members')
          .select('*, profiles(id, nickname, skill_level, avatar_url, region)')
          .eq('club_id', clubId)
          .eq('status', 'approved')
          .order('joined_at', { ascending: true }),
      ]);
      setClub(c ?? null);
      setMembers((m as unknown as ClubMemberWithProfile[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isTrialing = club?.premium_status === 'trialing' && !!club.premium_trial_ends_at && new Date(club.premium_trial_ends_at).getTime() > nowMs;
  const isPremiumUsable = club?.tier === 'premium' && (club.premium_status === 'active' || isTrialing);
  const myMembership = members.find((member) => member.user_id === uid);
  const canRecord = Boolean(uid && club && isPremiumUsable && myMembership);

  const selectedNames = useMemo(() => {
    const map = new Map(members.map((member) => [member.user_id, member.profiles?.nickname ?? '알 수 없음']));
    return {
      team1: team1Player ? map.get(team1Player) ?? '선수 1' : '선수 1',
      team2: team2Player ? map.get(team2Player) ?? '선수 2' : '선수 2',
    };
  }, [members, team1Player, team2Player]);

  async function submit() {
    if (!uid || !clubId || !canRecord) {
      Alert.alert('기록 불가', '프리미엄 클럽 멤버만 경기 결과를 기록할 수 있어요.');
      return;
    }
    if (!team1Player || !team2Player || team1Player === team2Player) {
      Alert.alert('선수 확인', '서로 다른 두 명의 선수를 선택해주세요.');
      return;
    }
    const s1 = Number(team1Score);
    const s2 = Number(team2Score);
    if (!Number.isInteger(s1) || !Number.isInteger(s2) || s1 < 0 || s2 < 0 || s1 > 99 || s2 > 99 || s1 === s2) {
      Alert.alert('점수 확인', '0~99 사이의 승패가 갈리는 점수를 입력해주세요.');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('club_match_results').insert({
      club_id: clubId,
      recorded_by: uid,
      match_date: new Date().toISOString().slice(0, 10),
      team1_player1: team1Player,
      team2_player1: team2Player,
      team1_score: s1,
      team2_score: s2,
      note: note.trim(),
    });
    setSaving(false);

    if (error) {
      Alert.alert('기록 실패', error.message);
      return;
    }
    Alert.alert('기록 완료', '클럽 경기 결과가 저장되었습니다.', [
      { text: '확인', onPress: () => router.back() },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Stack.Screen options={{ title: '경기 결과 기록', headerShadowVisible: false }} />
        <View style={styles.center}>
          <ActivityIndicator color="#16C784" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: '경기 결과 기록', headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>CLUB MATCH</Text>
          <Text style={styles.title}>단식 결과 기록</Text>
          <Text style={styles.subtitle}>{club?.name ?? '클럽'} 멤버끼리 진행한 경기 결과를 남겨요.</Text>
        </View>

        {!canRecord ? (
          <View style={styles.lockedBox}>
            <Ionicons name="lock-closed-outline" size={20} color="#AAB4C0" />
            <Text style={styles.lockedText}>프리미엄 클럽의 승인 멤버만 기록할 수 있어요.</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>선수 선택</Text>
          <Text style={styles.fieldLabel}>플레이어 A</Text>
          <View style={styles.memberGrid}>
            {members.map((member) => (
              <MemberOption
                key={`team1-${member.user_id}`}
                member={member}
                selected={team1Player === member.user_id}
                disabled={team2Player === member.user_id}
                onPress={() => setTeam1Player(member.user_id)}
              />
            ))}
          </View>

          <Text style={styles.fieldLabel}>플레이어 B</Text>
          <View style={styles.memberGrid}>
            {members.map((member) => (
              <MemberOption
                key={`team2-${member.user_id}`}
                member={member}
                selected={team2Player === member.user_id}
                disabled={team1Player === member.user_id}
                onPress={() => setTeam2Player(member.user_id)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>스코어</Text>
          <View style={styles.scoreFields}>
            <TextField
              label={selectedNames.team1}
              value={team1Score}
              onChangeText={setTeam1Score}
              placeholder="11"
              keyboardType="number-pad"
              maxLength={2}
              style={styles.scoreInput}
            />
            <Text style={styles.scoreDivider}>:</Text>
            <TextField
              label={selectedNames.team2}
              value={team2Score}
              onChangeText={setTeam2Score}
              placeholder="8"
              keyboardType="number-pad"
              maxLength={2}
              style={styles.scoreInput}
            />
          </View>
          <TextField
            label="메모"
            value={note}
            onChangeText={setNote}
            placeholder="예: 월례전 예선, 연습 경기"
            multiline
            maxLength={120}
            style={styles.noteInput}
          />
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        <Button title="경기 결과 저장" onPress={submit} loading={saving} disabled={!canRecord} />
      </View>
    </SafeAreaView>
  );
}

function MemberOption({
  member,
  selected,
  disabled,
  onPress,
}: {
  member: ClubMemberWithProfile;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.memberOption,
        selected && styles.memberOptionSelected,
        disabled && styles.memberOptionDisabled,
        pressed && !disabled && { opacity: 0.86 },
      ]}>
      <Avatar nickname={member.profiles?.nickname ?? '?'} uri={member.profiles?.avatar_url} size={28} />
      <Text style={[styles.memberName, selected && styles.memberNameSelected]} numberOfLines={1}>
        {member.profiles?.nickname ?? '알 수 없음'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 120 },
  hero: {
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.four,
    gap: 8,
  },
  eyebrow: { color: '#16C784', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { color: '#F8FAFC', fontSize: 26, fontWeight: '900' },
  subtitle: { color: '#AAB4C0', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  lockedBox: {
    minHeight: 64,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: '#151D25',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.three,
  },
  lockedText: { flex: 1, color: '#AAB4C0', fontSize: 14, fontWeight: '700' },
  section: { gap: 12 },
  sectionTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' },
  fieldLabel: { color: '#AAB4C0', fontSize: 13, fontWeight: '800' },
  memberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberOption: {
    minHeight: 44,
    maxWidth: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 12,
  },
  memberOptionSelected: { backgroundColor: 'rgba(22,199,132,0.16)', borderColor: '#16C784' },
  memberOptionDisabled: { opacity: 0.35 },
  memberName: { flex: 1, color: '#F8FAFC', fontSize: 13, fontWeight: '800' },
  memberNameSelected: { color: '#16C784' },
  scoreFields: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  scoreInput: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '900' },
  scoreDivider: { color: '#F8FAFC', fontSize: 26, fontWeight: '900', paddingBottom: 12 },
  noteInput: { minHeight: 96, textAlignVertical: 'top' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.three,
    paddingBottom: Spacing.four,
    backgroundColor: '#070A0D',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.09)',
  },
});
