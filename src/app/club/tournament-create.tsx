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
import type { Discipline, TournamentFormat } from '@/lib/types';

function defaultStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(10, 0, 0, 0);
  return d;
}

const DISCIPLINES: { value: Discipline; label: string }[] = [
  { value: 'singles', label: '단식' },
  { value: 'doubles', label: '복식' },
];

const FORMATS: { value: TournamentFormat; label: string; hint: string }[] = [
  { value: 'group_knockout', label: '조별 + 토너먼트', hint: '예선 조별리그 후 본선 토너먼트' },
  { value: 'kdk', label: 'KDK (대진표)', hint: '개인 풀리그 방식' },
  { value: 'team', label: '단체전', hint: '팀 신청·오더 대결' },
];

export default function CreateClubTournament() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { session } = useAuth();
  const { show, hide } = useLoading();

  const [clubName, setClubName] = useState('');
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [region, setRegion] = useState('');
  const [start, setStart] = useState<Date>(defaultStart());
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [discipline, setDiscipline] = useState<Discipline>('doubles');
  const [format, setFormat] = useState<TournamentFormat>('group_knockout');
  const [maxParticipants, setMaxParticipants] = useState(16);
  const [fee, setFee] = useState('');
  const [saving, setSaving] = useState(false);

  // 클럽 이름 표기 + 소유권(클럽장) 확인
  useEffect(() => {
    if (!clubId || !session?.user.id) return;
    supabase
      .from('clubs')
      .select('name, owner_id')
      .eq('id', clubId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setClubName(data.name);
        if (data.owner_id !== session.user.id) {
          Alert.alert('권한 없음', '클럽 월례대회는 클럽장만 개설할 수 있어요.');
          router.back();
        }
      });
  }, [clubId, session?.user.id, router]);

  function openPicker() {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (_e, date) => {
          if (!date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: 'time',
            is24Hour: true,
            onChange: (_e2, time) => {
              if (!time) return;
              const merged = new Date(date);
              merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
              setStart(merged);
            },
          });
        },
      });
    } else {
      setShowIosPicker(true);
    }
  }

  async function onSubmit() {
    if (!title.trim()) {
      Alert.alert('입력 확인', '대회 이름을 입력해주세요.');
      return;
    }
    if (!session?.user.id || !clubId) return;
    setSaving(true);
    show();
    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        organizer_id: session.user.id,
        club_id: clubId,
        title: title.trim(),
        venue: venue.trim(),
        region: region.trim(),
        start_at: start.toISOString(),
        discipline,
        format,
        max_participants: maxParticipants,
        fee: Math.max(0, parseInt(fee.replace(/[^0-9]/g, ''), 10) || 0),
      })
      .select('id')
      .single();
    setSaving(false);
    hide();
    if (error) {
      Alert.alert('개설 실패', error.message);
      return;
    }
    router.replace(`/tournament/${data.id}`);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {clubName ? (
          <View style={styles.clubBanner}>
            <Ionicons name="people" size={16} color="#16C784" />
            <Text style={styles.clubBannerText}>{clubName} 월례대회</Text>
          </View>
        ) : null}

        <TextField
          label="대회 이름"
          value={title}
          onChangeText={setTitle}
          placeholder="예: 8월 클럽 월례대회"
          maxLength={40}
        />
        <TextField label="장소 (선택)" value={venue} onChangeText={setVenue} placeholder="예: 송파 체육관 3코트" />
        <TextField label="지역 (선택)" value={region} onChangeText={setRegion} placeholder="예: 서울 송파구" />

        <View style={styles.field}>
          <Text style={styles.label}>날짜 · 시간</Text>
          <Pressable onPress={openPicker} style={styles.dateBtn}>
            <Ionicons name="calendar-outline" size={20} color="#16C784" />
            <Text style={styles.dateTxt}>{formatMeetupTime(start.toISOString())}</Text>
          </Pressable>
          {Platform.OS === 'ios' && showIosPicker && (
            <DateTimePicker
              value={start}
              mode="datetime"
              display="inline"
              minimumDate={new Date()}
              onChange={(_e, date) => date && setStart(date)}
            />
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>종목</Text>
          <View style={styles.segRow}>
            {DISCIPLINES.map((d) => (
              <Pressable
                key={d.value}
                onPress={() => setDiscipline(d.value)}
                style={[styles.segChip, discipline === d.value && styles.segChipOn]}>
                <Text style={[styles.segText, discipline === d.value && styles.segTextOn]}>{d.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>진행 방식</Text>
          <View style={{ gap: 8 }}>
            {FORMATS.map((f) => (
              <Pressable
                key={f.value}
                onPress={() => setFormat(f.value)}
                style={[styles.formatCard, format === f.value && styles.formatCardOn]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.formatTitle, format === f.value && styles.formatTitleOn]}>{f.label}</Text>
                  <Text style={styles.formatHint}>{f.hint}</Text>
                </View>
                <Ionicons
                  name={format === f.value ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={format === f.value ? '#16C784' : '#707B87'}
                />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>정원</Text>
          <View style={styles.stepper}>
            <Pressable onPress={() => setMaxParticipants((v) => Math.max(2, v - 2))} style={styles.stepBtn}>
              <Ionicons name="remove" size={20} color="#F8FAFC" />
            </Pressable>
            <Text style={styles.stepVal}>{maxParticipants}명</Text>
            <Pressable onPress={() => setMaxParticipants((v) => Math.min(256, v + 2))} style={styles.stepBtn}>
              <Ionicons name="add" size={20} color="#F8FAFC" />
            </Pressable>
          </View>
        </View>

        <TextField
          label="참가비 (원)"
          value={fee}
          onChangeText={(v) => setFee(v.replace(/[^0-9]/g, ''))}
          placeholder="0 (무료). 예: 10000"
          keyboardType="number-pad"
          hint={
            fee && parseInt(fee, 10) > 0
              ? `참가자에게 ${parseInt(fee, 10).toLocaleString()}원으로 표시돼요`
              : '비워두면 무료로 표시돼요'
          }
        />

        <View style={styles.noteRow}>
          <Ionicons name="information-circle-outline" size={18} color="#16C784" />
          <Text style={styles.noteText}>개설 후 대회 상세에서 참가 신청을 받고 대진을 진행할 수 있어요.</Text>
        </View>

        <Button title="월례대회 개설" onPress={onSubmit} loading={saving} style={{ marginTop: Spacing.two }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  segRow: { flexDirection: 'row', gap: 8 },
  segChip: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  segChipOn: { borderColor: '#16C784', backgroundColor: 'rgba(22,199,132,0.12)' },
  segText: { color: '#AAB4C0', fontSize: 15, fontWeight: '800' },
  segTextOn: { color: '#16C784' },
  formatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
  },
  formatCardOn: { borderColor: '#16C784', backgroundColor: 'rgba(22,199,132,0.12)' },
  formatTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  formatTitleOn: { color: '#16C784' },
  formatHint: { color: '#AAB4C0', fontSize: 12, fontWeight: '600', marginTop: 3 },
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
