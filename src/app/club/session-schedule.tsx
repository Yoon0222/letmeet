import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';
import { useClubAccess } from '@/lib/use-club-access';
import type { ClubSessionSchedule } from '@/lib/types';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

// 'HH:MM:SS' → '오후 7:00'
function fmtTime(hhmmss: string): string {
  const [h, m] = hhmmss.split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${String(m).padStart(2, '0')}`;
}
function ruleSummary(s: ClubSessionSchedule): string {
  return `매주 ${DOW[s.weekday]} ${fmtTime(s.start_time)} · 투표 ${s.vote_open_days}일 전 오픈~${s.vote_close_days}일 전 마감 · ${s.court_count}면·${s.point_target}점`;
}

export default function ClubSessionScheduleScreen() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;
  const { isOwner, isPremiumUsable, loading: accessLoading } = useClubAccess(clubId);

  const [rows, setRows] = useState<ClubSessionSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  // 폼 상태(추가/수정 공용)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [weekday, setWeekday] = useState(6); // 기본 토요일
  const [time, setTime] = useState('19:00:00');
  const [showTimeIos, setShowTimeIos] = useState(false);
  const [voteOpen, setVoteOpen] = useState(5);
  const [voteClose, setVoteClose] = useState(1);
  const [title, setTitle] = useState('정기모임');
  const [location, setLocation] = useState('');
  const [courtCount, setCourtCount] = useState(2);
  const [pointTarget, setPointTarget] = useState(16);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clubId) return;
    const { data } = await supabase
      .from('club_session_schedules')
      .select('*')
      .eq('club_id', clubId)
      .order('weekday', { ascending: true });
    setRows((data as ClubSessionSchedule[] | null) ?? []);
    setLoading(false);
  }, [clubId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function resetForm() {
    setEditingId(null);
    setWeekday(6);
    setTime('19:00:00');
    setVoteOpen(5);
    setVoteClose(1);
    setTitle('정기모임');
    setLocation('');
    setCourtCount(2);
    setPointTarget(16);
  }
  function loadIntoForm(s: ClubSessionSchedule) {
    setEditingId(s.id);
    setWeekday(s.weekday);
    setTime(s.start_time);
    setVoteOpen(s.vote_open_days);
    setVoteClose(s.vote_close_days);
    setTitle(s.title);
    setLocation(s.location);
    setCourtCount(s.court_count);
    setPointTarget(s.point_target);
  }

  function pickTime() {
    const [h, m] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    const apply = (t: Date) => setTime(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:00`);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: d, mode: 'time', is24Hour: true, onChange: (_e, t) => t && apply(t) });
    } else {
      setShowTimeIos(true);
    }
  }

  async function onSave() {
    if (!clubId || !uid) return;
    if (voteOpen < voteClose) {
      Alert.alert('입력 확인', '투표 오픈은 마감보다 더 며칠 전이어야 해요.');
      return;
    }
    setSaving(true);
    const base = {
      weekday,
      start_time: time,
      vote_open_days: voteOpen,
      vote_close_days: voteClose,
      title: title.trim() || '정기모임',
      location: location.trim(),
      court_count: courtCount,
      point_target: pointTarget,
    };
    const { error } = editingId
      ? await supabase.from('club_session_schedules').update(base).eq('id', editingId)
      : await supabase.from('club_session_schedules').insert({ club_id: clubId, created_by: uid, ...base });
    if (error) {
      setSaving(false);
      Alert.alert('저장 실패', error.message);
      return;
    }
    // 지금 도래한 회차가 있으면 즉시 생성(투표 오픈 시점이 이미 지났다면 바로 개설)
    await supabase.rpc('generate_due_club_sessions', { p_club_id: clubId });
    setSaving(false);
    resetForm();
    load();
  }

  async function toggleActive(s: ClubSessionSchedule) {
    await supabase.from('club_session_schedules').update({ active: !s.active }).eq('id', s.id);
    if (!s.active) await supabase.rpc('generate_due_club_sessions', { p_club_id: clubId });
    load();
  }
  function remove(s: ClubSessionSchedule) {
    Alert.alert('삭제', '이 반복 스케줄을 삭제할까요? 이미 생성된 회차는 그대로 유지돼요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('club_session_schedules').delete().eq('id', s.id);
          if (editingId === s.id) resetForm();
          load();
        },
      },
    ]);
  }

  if (accessLoading || loading) {
    return <View style={styles.center}><ActivityIndicator color="#16C784" /></View>;
  }
  if (!isOwner) {
    return <View style={styles.center}><Text style={styles.gate}>반복 스케줄은 클럽장만 설정할 수 있어요.</Text></View>;
  }
  if (!isPremiumUsable) {
    return <View style={styles.center}><Text style={styles.gate}>프리미엄 클럽에서만 정기모임을 운영할 수 있어요.</Text></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.noteRow}>
          <Ionicons name="repeat" size={18} color="#16C784" />
          <Text style={styles.noteText}>지정한 요일마다 정기모임이 자동 개설되고, 투표 오픈 시점에 클럽원에게 알림이 가요.</Text>
        </View>

        {/* 등록된 반복 규칙 */}
        {rows.length > 0 && (
          <View style={{ gap: 10 }}>
            {rows.map((s) => (
              <View key={s.id} style={[styles.card, editingId === s.id && styles.cardActive]}>
                <Pressable style={{ flex: 1 }} onPress={() => loadIntoForm(s)}>
                  <Text style={[styles.cardTitle, !s.active && styles.dim]}>{s.title || '정기모임'}</Text>
                  <Text style={[styles.cardMeta, !s.active && styles.dim]}>{ruleSummary(s)}</Text>
                </Pressable>
                <Switch
                  value={s.active}
                  onValueChange={() => toggleActive(s)}
                  trackColor={{ true: '#16C784', false: '#2A343E' }}
                  thumbColor="#F8FAFC"
                />
                <Pressable onPress={() => remove(s)} hitSlop={8} style={styles.trash}>
                  <Ionicons name="trash-outline" size={18} color="#707B87" />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* 추가/수정 폼 */}
        <Text style={styles.formTitle}>{editingId ? '반복 규칙 수정' : '새 반복 규칙'}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>요일</Text>
          <View style={styles.dowRow}>
            {DOW.map((d, i) => (
              <Pressable key={d} onPress={() => setWeekday(i)} style={[styles.dowChip, weekday === i && styles.dowChipOn]}>
                <Text style={[styles.dowTxt, weekday === i && styles.dowTxtOn]}>{d}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>시작 시각</Text>
          <Pressable onPress={pickTime} style={styles.dateBtn}>
            <Ionicons name="time-outline" size={20} color="#16C784" />
            <Text style={styles.dateTxt}>{fmtTime(time)}</Text>
          </Pressable>
          {Platform.OS === 'ios' && showTimeIos && (
            <DateTimePicker
              value={(() => { const [h, m] = time.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; })()}
              mode="time"
              display="spinner"
              onChange={(_e, t) => t && setTime(`${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:00`)}
            />
          )}
        </View>

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>투표 오픈</Text>
            <Stepper value={`${voteOpen}일 전`} onMinus={() => setVoteOpen((v) => Math.max(voteClose, v - 1))} onPlus={() => setVoteOpen((v) => Math.min(21, v + 1))} />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>투표 마감</Text>
            <Stepper value={`${voteClose}일 전`} onMinus={() => setVoteClose((v) => Math.max(0, v - 1))} onPlus={() => setVoteClose((v) => Math.min(voteOpen, v + 1))} />
          </View>
        </View>

        <TextField label="모임 이름" value={title} onChangeText={setTitle} placeholder="예: 주말 정기모임" maxLength={40} />
        <TextField label="장소 (선택)" value={location} onChangeText={setLocation} placeholder="예: 송파 체육관" />

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>코트 수</Text>
            <Stepper value={`${courtCount}면`} onMinus={() => setCourtCount((v) => Math.max(1, v - 1))} onPlus={() => setCourtCount((v) => Math.min(20, v + 1))} />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>목표 점수</Text>
            <Stepper value={`${pointTarget}점`} onMinus={() => setPointTarget((v) => Math.max(1, v - 1))} onPlus={() => setPointTarget((v) => Math.min(99, v + 1))} />
          </View>
        </View>

        <View style={styles.btnRow}>
          {editingId ? (
            <Button title="취소" variant="outline" onPress={resetForm} style={{ flex: 1 }} />
          ) : null}
          <Button title={editingId ? '수정 저장' : '반복 추가'} onPress={onSave} loading={saving} style={{ flex: 1 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stepper({ value, onMinus, onPlus }: { value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onMinus} style={styles.stepBtn}>
        <Ionicons name="remove" size={20} color="#F8FAFC" />
      </Pressable>
      <Text style={styles.stepVal}>{value}</Text>
      <Pressable onPress={onPlus} style={styles.stepBtn}>
        <Ionicons name="add" size={20} color="#F8FAFC" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D', padding: Spacing.four },
  gate: { color: '#AAB4C0', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 60 },
  noteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(22,199,132,0.12)', borderWidth: 1, borderColor: 'rgba(22,199,132,0.22)',
    borderRadius: 16, borderCurve: 'continuous', padding: Spacing.three,
  },
  noteText: { flex: 1, fontSize: 13, color: '#16C784', fontWeight: '700', lineHeight: 18 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', padding: Spacing.three,
  },
  cardActive: { borderColor: 'rgba(22,199,132,0.45)' },
  cardTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  cardMeta: { color: '#AAB4C0', fontSize: 12, fontWeight: '600', marginTop: 3, lineHeight: 16 },
  dim: { opacity: 0.45 },
  trash: { padding: 4 },
  formTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800', marginTop: Spacing.two },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#AAB4C0', marginLeft: 2 },
  dowRow: { flexDirection: 'row', gap: 6 },
  dowChip: {
    flex: 1, height: 44, borderRadius: 12, borderCurve: 'continuous',
    backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center', justifyContent: 'center',
  },
  dowChipOn: { backgroundColor: '#16C784', borderColor: '#16C784' },
  dowTxt: { color: '#AAB4C0', fontSize: 14, fontWeight: '800' },
  dowTxtOn: { color: '#07100D' },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52,
    borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', paddingHorizontal: Spacing.three,
  },
  dateTxt: { fontSize: 16, fontWeight: '600', color: '#F8FAFC' },
  row: { flexDirection: 'row', gap: Spacing.three },
  stepper: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52,
    borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', paddingHorizontal: Spacing.two,
  },
  stepBtn: { width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: '#151D25' },
  stepVal: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  btnRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
});
