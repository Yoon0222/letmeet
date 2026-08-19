import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useLoading } from '@/contexts/loading';
import { formatMeetupTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';

// 정기모임 기본 일자: 다음 주말(토요일) 오전 10시
function defaultSessionDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  d.setHours(10, 0, 0, 0);
  return d;
}
// 기본 투표 마감: 모임 전날 밤 9시
function defaultDeadline(sessionDate: Date): Date {
  const d = new Date(sessionDate);
  d.setDate(d.getDate() - 1);
  d.setHours(21, 0, 0, 0);
  return d;
}

export default function CreateClubSession() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { session } = useAuth();
  const { show, hide } = useLoading();

  const [clubName, setClubName] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [sessionDate, setSessionDate] = useState<Date>(defaultSessionDate);
  const [deadline, setDeadline] = useState<Date>(() => defaultDeadline(defaultSessionDate()));
  const [showDateIos, setShowDateIos] = useState(false);
  const [showDeadlineIos, setShowDeadlineIos] = useState(false);
  const [courtCount, setCourtCount] = useState(2);
  const [pointTarget, setPointTarget] = useState(16);
  const [saving, setSaving] = useState(false);

  // 클럽 이름 + 관리 권한(클럽장/임원) 확인
  useEffect(() => {
    if (!clubId || !session?.user.id) return;
    (async () => {
      const [{ data: club }, { data: mem }] = await Promise.all([
        supabase.from('clubs').select('name, owner_id').eq('id', clubId).maybeSingle(),
        supabase.from('club_members').select('role, status').eq('club_id', clubId).eq('user_id', session.user.id).maybeSingle(),
      ]);
      if (!club) return;
      setClubName(club.name);
      const isManager = club.owner_id === session.user.id || (mem?.role === 'officer' && mem?.status === 'approved');
      if (!isManager) {
        Alert.alert('권한 없음', '정기모임은 클럽장·임원만 개설할 수 있어요.');
        router.back();
      }
    })();
  }, [clubId, session?.user.id, router]);

  function openDatePicker(kind: 'date' | 'deadline') {
    const current = kind === 'date' ? sessionDate : deadline;
    const apply = (next: Date) => {
      if (kind === 'date') {
        setSessionDate(next);
        setDeadline(defaultDeadline(next)); // 일자 바꾸면 마감 기본값도 따라감
      } else {
        setDeadline(next);
      }
    };
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (_e, d) => {
          if (!d) return;
          DateTimePickerAndroid.open({
            value: d,
            mode: 'time',
            is24Hour: true,
            onChange: (_e2, t) => {
              if (!t) return;
              const merged = new Date(d);
              merged.setHours(t.getHours(), t.getMinutes(), 0, 0);
              apply(merged);
            },
          });
        },
      });
    } else {
      if (kind === 'date') setShowDateIos(true);
      else setShowDeadlineIos(true);
    }
  }

  async function onSubmit() {
    if (!title.trim()) {
      Alert.alert('입력 확인', '모임 이름을 입력해주세요.');
      return;
    }
    if (deadline.getTime() >= sessionDate.getTime()) {
      Alert.alert('일정 확인', '투표 마감은 모임 시작보다 앞서야 해요.');
      return;
    }
    if (!session?.user.id || !clubId) return;
    setSaving(true);
    show();
    const { data, error } = await supabase
      .from('club_sessions')
      .insert({
        club_id: clubId,
        created_by: session.user.id,
        title: title.trim(),
        location: location.trim(),
        session_date: sessionDate.toISOString().slice(0, 10),
        start_at: sessionDate.toISOString(),
        vote_deadline: deadline.toISOString(),
        court_count: courtCount,
        point_target: pointTarget,
        status: 'voting',
      })
      .select('id')
      .single();
    setSaving(false);
    hide();
    if (error) {
      Alert.alert('개설 실패', error.message);
      return;
    }
    router.replace(`/club/session/${data.id}`);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {clubName ? (
          <View style={styles.clubBanner}>
            <Ionicons name="people" size={16} color="#16C784" />
            <Text style={styles.clubBannerText}>{clubName} 정기모임</Text>
          </View>
        ) : null}

        <TextField label="모임 이름" value={title} onChangeText={setTitle} placeholder="예: 8월 3주 정기모임" maxLength={40} />
        <TextField label="장소 (선택)" value={location} onChangeText={setLocation} placeholder="예: 송파 체육관" />

        <View style={styles.field}>
          <Text style={styles.label}>정기모임 일자</Text>
          <Pressable onPress={() => openDatePicker('date')} style={styles.dateBtn}>
            <Ionicons name="calendar-outline" size={20} color="#16C784" />
            <Text style={styles.dateTxt}>{formatMeetupTime(sessionDate.toISOString())}</Text>
          </Pressable>
          {Platform.OS === 'ios' && showDateIos && (
            <DateTimePicker
              value={sessionDate}
              mode="datetime"
              display="inline"
              minimumDate={new Date()}
              onChange={(_e, d) => {
                if (d) {
                  setSessionDate(d);
                  setDeadline(defaultDeadline(d));
                }
              }}
            />
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>투표 마감</Text>
          <Pressable onPress={() => openDatePicker('deadline')} style={styles.dateBtn}>
            <Ionicons name="time-outline" size={20} color="#16C784" />
            <Text style={styles.dateTxt}>{formatMeetupTime(deadline.toISOString())}</Text>
          </Pressable>
          <Text style={styles.hint}>마감 후에는 임원만 참석 명단을 조정할 수 있어요.</Text>
          {Platform.OS === 'ios' && showDeadlineIos && (
            <DateTimePicker
              value={deadline}
              mode="datetime"
              display="inline"
              minimumDate={new Date()}
              maximumDate={sessionDate}
              onChange={(_e, d) => d && setDeadline(d)}
            />
          )}
        </View>

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

        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={18} color="#16C784" />
          <Text style={styles.noteText}>개설 후 클럽원이 참석 투표를 하고, 대진은 모임 당일 오전 0시부터 생성할 수 있어요.</Text>
        </View>

        <Button title="정기모임 개설" onPress={onSubmit} loading={saving} style={{ marginTop: Spacing.two }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  flex: { flex: 1, backgroundColor: '#070A0D' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 60 },
  clubBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(22,199,132,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22,199,132,0.22)',
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  clubBannerText: { color: '#16C784', fontSize: 14, fontWeight: '800' },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#AAB4C0', marginLeft: 2 },
  hint: { fontSize: 12, color: '#707B87', marginLeft: 2 },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: Spacing.three,
  },
  dateTxt: { fontSize: 16, fontWeight: '600', color: '#F8FAFC' },
  row: { flexDirection: 'row', gap: Spacing.three },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: Spacing.two,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151D25',
  },
  stepVal: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(22,199,132,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22,199,132,0.22)',
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
  noteText: { flex: 1, fontSize: 13, color: '#16C784', fontWeight: '700', lineHeight: 18 },
});
