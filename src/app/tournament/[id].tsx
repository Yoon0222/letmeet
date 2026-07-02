import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useLoading } from '@/contexts/loading';
import { useTheme } from '@/hooks/use-theme';
import { formatMeetupTime, skillLabel, skillRangeLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { EntryStatus, TournamentEntryWithProfile, TournamentWithCounts } from '@/lib/types';

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
  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: tour }, { data: ents }] = await Promise.all([
      supabase.from('tournaments_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('tournament_entries')
        .select('*, profiles(id, nickname, skill_level, avatar_url, region)')
        .eq('tournament_id', id)
        .order('created_at', { ascending: true }),
    ]);
    setT(tour ?? null);
    setEntries((ents as unknown as TournamentEntryWithProfile[]) ?? []);
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

  async function apply() {
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase.from('tournament_entries').insert({
      tournament_id: id,
      user_id: uid,
      partner_name: t?.discipline === 'doubles' ? partner.trim() || null : null,
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
      <ScrollView contentContainerStyle={styles.content}>
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
                      {t.discipline === 'doubles' && e.partner_name ? ` / ${e.partner_name}` : ''}
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

        {/* 복식 파트너 입력 (미신청 + 접수중일 때) */}
        {canRegister && !myEntry && t.discipline === 'doubles' && (
          <View style={styles.section}>
            <TextField
              label="파트너 이름 (복식)"
              value={partner}
              onChangeText={setPartner}
              placeholder="함께 출전할 파트너"
            />
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
});
