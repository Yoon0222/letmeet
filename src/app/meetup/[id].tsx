import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { formatMeetupTime, skillLabel, skillRangeLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { MeetupWithCounts, ParticipantWithProfile } from '@/lib/types';

export default function MeetupDetail() {
  const theme = useTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [meetup, setMeetup] = useState<MeetupWithCounts | null>(null);
  const [participants, setParticipants] = useState<ParticipantWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: m }, { data: p }] = await Promise.all([
      supabase.from('meetups_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('meetup_participants')
        .select('*, profiles(id, nickname, skill_level, avatar_url, region)')
        .eq('meetup_id', id)
        .order('joined_at', { ascending: true }),
    ]);
    setMeetup(m ?? null);
    setParticipants((p as unknown as ParticipantWithProfile[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // load 는 비동기로 await 이후 setState 를 호출하므로 동기 cascading 렌더가 아니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isHost = meetup?.host_id === uid;
  const joined = participants.some((p) => p.user_id === uid);
  const full = !!meetup && meetup.participant_count >= meetup.max_players;
  const closed = meetup?.status !== 'open';

  useEffect(() => {
    navigation.setOptions({ title: meetup?.title ?? '모임 상세' });
  }, [navigation, meetup?.title]);

  async function join() {
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase.from('meetup_participants').insert({ meetup_id: id, user_id: uid });
    setActing(false);
    if (error) {
      Alert.alert('참가 실패', error.message);
      return;
    }
    load();
  }

  async function leave() {
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase
      .from('meetup_participants')
      .delete()
      .eq('meetup_id', id)
      .eq('user_id', uid);
    setActing(false);
    if (error) {
      Alert.alert('취소 실패', error.message);
      return;
    }
    load();
  }

  function confirmLeave() {
    Alert.alert('참가 취소', '이 모임 참가를 취소할까요?', [
      { text: '닫기', style: 'cancel' },
      { text: '참가 취소', style: 'destructive', onPress: leave },
    ]);
  }

  function confirmCancelMeetup() {
    Alert.alert('모임 취소', '모임을 취소하면 되돌릴 수 없어요. 진행할까요?', [
      { text: '닫기', style: 'cancel' },
      {
        text: '모임 취소',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          await supabase.from('meetups').update({ status: 'cancelled' }).eq('id', id);
          router.back();
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

  if (!meetup) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>모임을 찾을 수 없어요.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          {closed ? (
            <Badge label={meetup.status === 'cancelled' ? '취소된 모임' : '마감된 모임'} color="#E5484D" bg="rgba(229,72,77,0.14)" />
          ) : full ? (
            <Badge label="정원 마감" color="#F5A623" bg="rgba(245,166,35,0.16)" />
          ) : (
            <Badge label="모집중" />
          )}
        </View>

        <Text style={[styles.title, { color: theme.text }]}>{meetup.title}</Text>

        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <InfoRow icon="time-outline" text={formatMeetupTime(meetup.start_time)} theme={theme} />
          <InfoRow
            icon="hourglass-outline"
            text={`약 ${Math.round(meetup.duration_min / 60 * 10) / 10}시간`}
            theme={theme}
          />
          <InfoRow
            icon="location-outline"
            text={`${meetup.location_name}${meetup.region ? ` · ${meetup.region}` : ''}`}
            theme={theme}
          />
          <InfoRow
            icon="ribbon-outline"
            text={`실력 ${skillRangeLabel(meetup.skill_min, meetup.skill_max)}`}
            theme={theme}
          />
          <InfoRow
            icon="people-outline"
            text={`정원 ${meetup.participant_count}/${meetup.max_players}명`}
            theme={theme}
          />
        </View>

        {meetup.description ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>소개</Text>
            <Text style={[styles.desc, { color: theme.textSecondary }]}>{meetup.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            참가자 {participants.length}명
          </Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            {participants.map((p) => (
              <View key={p.user_id} style={styles.pRow}>
                <Avatar nickname={p.profiles?.nickname ?? '?'} uri={p.profiles?.avatar_url} size={40} />
                <View style={{ flex: 1 }}>
                  <View style={styles.pNameRow}>
                    <Text style={[styles.pName, { color: theme.text }]}>
                      {p.profiles?.nickname ?? '알 수 없음'}
                    </Text>
                    {p.user_id === meetup.host_id && <Badge label="호스트" color="#2D7FF9" bg="rgba(45,127,249,0.14)" />}
                  </View>
                  <Text style={[styles.pMeta, { color: theme.textSecondary }]}>
                    {p.profiles?.region || '지역 미설정'}
                  </Text>
                </View>
                <Text style={[styles.pSkill, { color: theme.primary }]}>
                  {p.profiles ? `${p.profiles.skill_level.toFixed(1)} ${skillLabel(p.profiles.skill_level)}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        {isHost ? (
          !closed ? (
            <Button title="모임 취소하기" variant="danger" onPress={confirmCancelMeetup} />
          ) : (
            <Button title="종료된 모임입니다" variant="secondary" disabled onPress={() => {}} />
          )
        ) : closed ? (
          <Button title="참가할 수 없는 모임입니다" variant="secondary" disabled onPress={() => {}} />
        ) : joined ? (
          <Button title="참가 취소" variant="outline" onPress={confirmLeave} loading={acting} />
        ) : (
          <Button
            title={full ? '정원이 가득 찼어요' : '참가하기'}
            onPress={join}
            disabled={full}
            loading={acting}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function InfoRow({
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

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.four },
  statusRow: { flexDirection: 'row' },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  infoCard: { borderRadius: 16, borderWidth: 1, padding: Spacing.three, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, fontWeight: '500', flex: 1 },
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  desc: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pName: { fontSize: 15, fontWeight: '700' },
  pMeta: { fontSize: 13, marginTop: 1 },
  pSkill: { fontSize: 13, fontWeight: '700' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1 },
});
