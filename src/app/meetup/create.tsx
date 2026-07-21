import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CourtPicker } from '@/components/court-picker';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useLoading } from '@/contexts/loading';
import { formatMeetupTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';

function defaultStart(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

export default function CreateMeetup() {
  const router = useRouter();
  const { session } = useAuth();
  const { show, hide } = useLoading();

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [region, setRegion] = useState('');
  const [courtId, setCourtId] = useState<string | null>(null); // 등록 코트 연결(선택) (0046)
  const [description, setDescription] = useState('');
  const [start, setStart] = useState<Date>(defaultStart());
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [skillMin, setSkillMin] = useState(2.0);
  const [skillMax, setSkillMax] = useState(8.0);
  const [fee, setFee] = useState(''); // 게스트비(원). 빈값=무료
  const [saving, setSaving] = useState(false);

  // 코트 등록 요청 모달 (검색에 없는 코트)
  const [reqOpen, setReqOpen] = useState(false);
  const [reqAddress, setReqAddress] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [reqSaving, setReqSaving] = useState(false);

  async function submitCourtRequest() {
    if (!session?.user.id || !location.trim()) return;
    setReqSaving(true);
    const { error } = await supabase.from('court_registration_requests').insert({
      requester_id: session.user.id,
      name: location.trim(),
      address: reqAddress.trim(),
      region: region.trim(),
      note: reqNote.trim(),
    });
    setReqSaving(false);
    if (error) {
      Alert.alert('요청 실패', error.message);
      return;
    }
    setReqOpen(false);
    setReqAddress('');
    setReqNote('');
    Alert.alert('등록 요청 완료', '운영자 확인 후 코트로 등록되면 검색에 나타나요.');
  }

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

  function adjust(setter: (fn: (v: number) => number) => void, delta: number, min: number, max: number) {
    setter((v) => Math.min(max, Math.max(min, Math.round((v + delta) * 10) / 10)));
  }

  async function onSubmit() {
    if (!title.trim() || !location.trim()) {
      Alert.alert('입력 확인', '제목과 장소를 입력해주세요.');
      return;
    }
    if (skillMin > skillMax) {
      Alert.alert('실력 범위', '최소 실력이 최대 실력보다 클 수 없습니다.');
      return;
    }
    if (!session?.user.id) return;
    setSaving(true);
    show();
    const { data, error } = await supabase
      .from('meetups')
      .insert({
        host_id: session.user.id,
        title: title.trim(),
        location_name: location.trim(),
        region: region.trim(),
        description: description.trim(),
        start_time: start.toISOString(),
        max_players: maxPlayers,
        skill_min: skillMin,
        skill_max: skillMax,
        fee: Math.max(0, parseInt(fee.replace(/[^0-9]/g, ''), 10) || 0),
        require_approval: true,
        court_id: courtId,
      })
      .select('id')
      .single();
    if (error) {
      setSaving(false);
      hide();
      Alert.alert('생성 실패', error.message);
      return;
    }
    setSaving(false);
    hide();
    router.replace(`/meetup/${data.id}`);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="제목"
          value={title}
          onChangeText={setTitle}
          placeholder="예: 평일 저녁 즐겜 복식"
          maxLength={40}
        />
        <CourtPicker
          value={{ name: location, region, courtId }}
          onChange={(v) => {
            setLocation(v.name);
            setRegion(v.region);
            setCourtId(v.courtId);
          }}
        />
        {!courtId && location.trim().length > 0 ? (
          <Pressable onPress={() => setReqOpen(true)} style={styles.reqLink}>
            <Ionicons name="add-circle-outline" size={16} color="#16C784" />
            <Text style={styles.reqLinkText}>이 코트가 목록에 없나요? 코트 등록 요청</Text>
          </Pressable>
        ) : null}
        <TextField label="지역" value={region} onChangeText={setRegion} placeholder="예: 서울 송파구" />

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
          <Text style={styles.label}>정원</Text>
          <Stepper
            value={`${maxPlayers}명`}
            onMinus={() => setMaxPlayers((v) => Math.max(2, v - 1))}
            onPlus={() => setMaxPlayers((v) => Math.min(32, v + 1))}
          />
        </View>

        <View style={styles.row2}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>최소 실력</Text>
            <Stepper
              value={skillMin.toFixed(1)}
              onMinus={() => adjust(setSkillMin as any, -0.5, 2, 8)}
              onPlus={() => adjust(setSkillMin as any, 0.5, 2, 8)}
            />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>최대 실력</Text>
            <Stepper
              value={skillMax.toFixed(1)}
              onMinus={() => adjust(setSkillMax as any, -0.5, 2, 8)}
              onPlus={() => adjust(setSkillMax as any, 0.5, 2, 8)}
            />
          </View>
        </View>

        <TextField
          label="게스트비 (원)"
          value={fee}
          onChangeText={(v) => setFee(v.replace(/[^0-9]/g, ''))}
          placeholder="0 (무료). 예: 5000"
          keyboardType="number-pad"
          hint={
            fee && parseInt(fee, 10) > 0
              ? `참가자에게 ${parseInt(fee, 10).toLocaleString()}원으로 표시돼요`
              : '비워두면 무료로 표시돼요'
          }
        />

        <View style={styles.approvalNote}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#16C784" />
          <Text style={styles.approvalNoteText}>참가는 호스트 승인제예요. 신청이 오면 신청자 리뷰·DUPR을 확인한 뒤 승인할 수 있어요.</Text>
        </View>

        <TextField
          label="설명 (선택)"
          value={description}
          onChangeText={setDescription}
          placeholder="모임 안내, 준비물, 비용 등"
          multiline
          maxLength={300}
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />

        <Button title="모임 만들기" onPress={onSubmit} loading={saving} style={{ marginTop: Spacing.two }} />
      </ScrollView>

      {/* 코트 등록 요청 모달 */}
      <Modal visible={reqOpen} transparent animationType="slide" onRequestClose={() => setReqOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>코트 등록 요청</Text>
            <Text style={styles.modalSub}>{`'${location.trim()}' 코트를 운영자에게 등록 요청해요.`}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="주소 (선택)"
              placeholderTextColor="#9CA3AF"
              value={reqAddress}
              onChangeText={setReqAddress}
            />
            <TextInput
              style={[styles.modalInput, { minHeight: 70, textAlignVertical: 'top' }]}
              placeholder="메모 (선택) — 실내/실외, 면 수 등"
              placeholderTextColor="#9CA3AF"
              value={reqNote}
              onChangeText={setReqNote}
              multiline
              maxLength={200}
            />
            <View style={styles.modalBtns}>
              <Button title="취소" variant="secondary" onPress={() => setReqOpen(false)} style={{ flex: 1 }} />
              <Button title={reqSaving ? '요청 중…' : '등록 요청'} onPress={submitCourtRequest} loading={reqSaving} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Stepper({ value, onMinus, onPlus }: { value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onMinus} style={styles.stepBtn}>
        <Text style={styles.stepTxt}>−</Text>
      </Pressable>
      <Text style={styles.stepVal}>{value}</Text>
      <Pressable onPress={onPlus} style={styles.stepBtn}>
        <Text style={styles.stepTxt}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 60 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginLeft: 2 },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.three,
    height: 52,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  dateTxt: { fontSize: 16, fontWeight: '600', color: '#111827' },
  row2: { flexDirection: 'row', gap: Spacing.three },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: Spacing.two,
    height: 52,
  },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 26, fontWeight: '800', color: '#16C784' },
  stepVal: { fontSize: 17, fontWeight: '700', color: '#111827' },
  approvalNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: '#EAFBF1',
    borderWidth: 1,
    borderColor: '#B6ECCB',
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
  approvalNoteText: { flex: 1, fontSize: 13, lineHeight: 19, color: '#0F7A4D' },
  reqLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4 },
  reqLinkText: { fontSize: 13, fontWeight: '700', color: '#16C784' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderCurve: 'continuous', padding: Spacing.four, gap: Spacing.three, paddingBottom: 36 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  modalSub: { fontSize: 13, color: '#6B7280' },
  modalInput: { borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: '#E5E7EB', padding: 12, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
