import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert as Alert } from '@/lib/feedback';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useClubAccess } from '@/lib/use-club-access';
import type { ClubMemberWithProfile } from '@/lib/types';

export default function ClubMembers() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { isOwner, canManage, loading: accessLoading } = useClubAccess(clubId);
  const [members, setMembers] = useState<ClubMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clubId) return;
    const { data } = await supabase
      .from('club_members')
      .select('*, profiles(id, nickname, skill_level, avatar_url, region)')
      .eq('club_id', clubId)
      .order('joined_at', { ascending: true });
    setMembers((data as unknown as ClubMemberWithProfile[]) ?? []);
    setLoading(false);
  }, [clubId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const approved = members.filter((m) => m.status === 'approved');
  const pending = members.filter((m) => m.status === 'pending');

  async function review(userId: string, approve: boolean) {
    if (!clubId) return;
    const { error } = await supabase.rpc('review_club_member', { p_club_id: clubId, p_user_id: userId, p_approve: approve });
    if (error) { Alert.alert(approve ? '승인 실패' : '거절 실패', error.message); return; }
    load();
  }

  async function setOfficer(userId: string, makeOfficer: boolean) {
    if (!isOwner || !clubId) return;
    const { error } = await supabase.rpc('set_club_officer', { p_club_id: clubId, p_user_id: userId, p_make_officer: makeOfficer });
    if (error) { Alert.alert(makeOfficer ? '임명 실패' : '해제 실패', error.message); return; }
    load();
  }

  if (loading || accessLoading) {
    return <View style={styles.center}><ActivityIndicator color="#16C784" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 클럽장/임원: 가입 요청 */}
        {canManage && pending.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>가입 요청 {pending.length}명</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {pending.map((m) => (
                <View key={m.user_id} style={styles.mRow}>
                  <Avatar nickname={m.profiles?.nickname ?? '?'} uri={m.profiles?.avatar_url} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mName}>{m.profiles?.nickname ?? '알 수 없음'}</Text>
                    <Text style={styles.mMeta}>{m.profiles?.region || '지역 미설정'}</Text>
                  </View>
                  <Pressable onPress={() => review(m.user_id, true)} style={styles.approveBtn}>
                    <Text style={styles.approveText}>승인</Text>
                  </Pressable>
                  <Pressable onPress={() => review(m.user_id, false)} style={styles.rejectBtn}>
                    <Text style={styles.rejectText}>거절</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>멤버 {approved.length}명</Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            {approved.map((m) => {
              const memberIsOfficer = m.role === 'officer';
              const canToggleOfficer = isOwner && m.role !== 'owner' && m.user_id !== uid;
              return (
                <View key={m.user_id} style={styles.mRow}>
                  <Avatar nickname={m.profiles?.nickname ?? '?'} uri={m.profiles?.avatar_url} size={40} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.mNameRow}>
                      <Text style={styles.mName}>{m.profiles?.nickname ?? '알 수 없음'}</Text>
                      {m.role === 'owner' && <Badge label="클럽장" color="#2D7FF9" bg="rgba(45,127,249,0.14)" />}
                      {memberIsOfficer && <Badge label="임원" color="#16C784" bg="rgba(22,199,132,0.14)" />}
                    </View>
                    <Text style={styles.mMeta}>{m.profiles?.region || '지역 미설정'}</Text>
                  </View>
                  {canToggleOfficer ? (
                    <Pressable onPress={() => setOfficer(m.user_id, !memberIsOfficer)} style={memberIsOfficer ? styles.rejectBtn : styles.approveBtn}>
                      <Text style={memberIsOfficer ? styles.rejectText : styles.approveText}>{memberIsOfficer ? '임원 해제' : '임원 임명'}</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.mSkill}>{m.profiles ? `${m.profiles.skill_level.toFixed(1)} ${skillLabel(m.profiles.skill_level)}` : ''}</Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  content: { padding: Spacing.four, gap: Spacing.three },
  section: { marginTop: Spacing.one },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#F8FAFC' },
  mRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  mMeta: { fontSize: 13, color: '#AAB4C0', marginTop: 1 },
  mSkill: { fontSize: 13, fontWeight: '700', color: '#16C784' },
  approveBtn: { backgroundColor: '#16C784', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  approveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rejectBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  rejectText: { color: '#AAB4C0', fontSize: 13, fontWeight: '700' },
});
