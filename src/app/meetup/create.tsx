import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourtPicker } from '@/components/court-picker';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useLoading } from '@/contexts/loading';
import { AppAlert as Alert } from '@/lib/feedback'; // RN Alert 는 웹 no-op — 웹에서도 뜨는 대체
import { formatMeetupTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { AppColors } from '@/theme';

function defaultStart(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
}

export default function CreateMeetup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const { show, hide } = useLoading();

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [region, setRegion] = useState('');
  const [courtId, setCourtId] = useState<string | null>(null); // 등록 코트 연결(선택) (0046)
  const [description, setDescription] = useState('');
  const [start, setStart] = useState<Date>(defaultStart());
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [discipline, setDiscipline] = useState<'any' | 'singles' | 'doubles'>('doubles'); // 종목 (0086)
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [skillMin, setSkillMin] = useState(2.0);
  const [skillMax, setSkillMax] = useState(8.0);
  const [fee, setFee] = useState(''); // 게스트비(원). 빈값=무료
  // DUPR 인증/프리미엄 옵션 (0059·0084) — 인증: 연결자만 참가·결과 DUPR 등록 / 프리미엄: DUPR+ 만 참가
  const [duprCertified, setDuprCertified] = useState(false);
  const [duprPremium, setDuprPremium] = useState(false);
  const duprConnected = profile?.dupr_status === 'verified'; // 계정 연결 여부
  const duprEligible = duprConnected && !!profile?.dupr_basic; // 연결 + BASIC 자격(활성 멤버십)
  const [saving, setSaving] = useState(false);

  // 코트 등록 요청 모달 (검색에 없는 코트)
  const [reqOpen, setReqOpen] = useState(false);
  const [reqAddress, setReqAddress] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [reqSaving, setReqSaving] = useState(false);
  const [keyboardBottom, setKeyboardBottom] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardBottom(Math.max(0, event.endCoordinates.height - insets.bottom));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardBottom(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

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
        dupr_certified: duprCertified,
        dupr_premium: duprCertified && duprPremium,
        discipline,
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
          <Text style={styles.label}>종목</Text>
          <View style={styles.segRow}>
            {(
              [
                { key: 'doubles', label: '복식' },
                { key: 'singles', label: '단식' },
                { key: 'any', label: '자유' },
              ] as const
            ).map((d) => (
              <Pressable
                key={d.key}
                onPress={() => setDiscipline(d.key)}
                style={[styles.seg, discipline === d.key && styles.segActive]}>
                <Text style={[styles.segText, discipline === d.key && styles.segTextActive]}>{d.label}</Text>
              </Pressable>
            ))}
          </View>
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

        {/* DUPR 인증/프리미엄 옵션 (0059·0084) */}
        <View style={styles.field}>
          <Text style={styles.label}>DUPR</Text>
          <View style={styles.duprBox}>
            <View style={styles.duprRow}>
              <View style={styles.duprRowText}>
                <Text style={styles.duprRowTitle}>DUPR 인증 번개</Text>
                <Text style={styles.duprRowSub}>
                  DUPR 연결 + BASIC 자격(활성 멤버십) 회원만 참가할 수 있고, 경기 결과가 DUPR 공식 레이팅에 반영돼요.
                </Text>
                {!duprConnected ? (
                  <Text style={styles.duprRowWarn}>호스트가 먼저 DUPR을 연결해야 켤 수 있어요 (프로필 → DUPR 연결)</Text>
                ) : !duprEligible ? (
                  <Text style={styles.duprRowWarn}>DUPR은 연결됐지만 BASIC 자격 확인이 안 됐어요 — 프로필에서 재연결하면 갱신돼요</Text>
                ) : null}
              </View>
              <Switch
                value={duprCertified}
                onValueChange={(v) => {
                  if (v && !duprEligible) {
                    if (duprConnected) {
                      Alert.alert(
                        'DUPR 자격 확인이 필요해요',
                        '계정은 연결됐지만 BASIC 자격(활성 멤버십)이 확인되지 않았어요. DUPR을 재연결하면 자격이 갱신돼요.',
                        [
                          { text: '나중에', style: 'cancel' },
                          { text: '재연결하기', onPress: () => router.push('/dupr-connect' as never) },
                        ],
                      );
                    } else {
                      Alert.alert(
                        'DUPR 연결이 필요해요',
                        'DUPR 인증 번개를 만들려면 호스트가 먼저 DUPR 계정을 연결해야 해요(활성 BASIC 자격).',
                        [
                          { text: '나중에', style: 'cancel' },
                          { text: 'DUPR 연결하기', onPress: () => router.push('/dupr-connect' as never) },
                        ],
                      );
                    }
                    return;
                  }
                  setDuprCertified(v);
                  if (!v) setDuprPremium(false);
                }}
                trackColor={{ false: AppColors.border, true: '#2D6BD6' }}
                thumbColor="#FFFFFF"
              />
            </View>
            {duprCertified ? (
              <View style={[styles.duprRow, styles.duprRowDivider]}>
                <View style={styles.duprRowText}>
                  <Text style={[styles.duprRowTitle, { color: '#8B5CF6' }]}>DUPR+ 전용</Text>
                  <Text style={styles.duprRowSub}>DUPR+ 회원(PREMIUM + VERIFIED 자격)만 참가할 수 있어요.</Text>
                </View>
                <Switch
                  value={duprPremium}
                  onValueChange={setDuprPremium}
                  trackColor={{ false: AppColors.border, true: '#8B5CF6' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            ) : null}
          </View>
        </View>

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
          <KeyboardAvoidingView
            style={styles.modalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View
              style={[
                styles.modalCard,
                {
                  marginBottom: keyboardBottom,
                  paddingBottom: Math.max(insets.bottom, 16) + 16,
                },
              ]}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalContent}>
                <Text style={styles.modalTitle}>코트 등록 요청</Text>
                <Text style={styles.modalSub}>{`'${location.trim()}' 코트를 운영자에게 등록 요청해요.`}</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="주소 (선택)"
                  placeholderTextColor="#9CA3AF"
                  value={reqAddress}
                  onChangeText={setReqAddress}
                  returnKeyType="next"
                />
                <TextInput
                  style={[styles.modalInput, styles.modalTextarea]}
                  placeholder="메모 (선택) - 실내/실외, 면 수 등"
                  placeholderTextColor="#9CA3AF"
                  value={reqNote}
                  onChangeText={setReqNote}
                  multiline
                  maxLength={200}
                  textAlignVertical="top"
                />
                <View style={styles.modalBtns}>
                  <Button title="취소" variant="secondary" onPress={() => setReqOpen(false)} style={{ flex: 1 }} />
                  <Button title={reqSaving ? '요청 중...' : '등록 요청'} onPress={submitCourtRequest} loading={reqSaving} style={{ flex: 1 }} />
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
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
  flex: { flex: 1, backgroundColor: AppColors.background },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 120 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: AppColors.textSecondary, marginLeft: 2 },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: Spacing.three,
    height: 52,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  dateTxt: { fontSize: 16, fontWeight: '600', color: AppColors.textPrimary },
  row2: { flexDirection: 'row', gap: Spacing.three },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingHorizontal: Spacing.two,
    height: 52,
  },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 26, fontWeight: '800', color: AppColors.primary },
  stepVal: { fontSize: 17, fontWeight: '700', color: AppColors.textPrimary },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  segActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  segText: { fontSize: 14, fontWeight: '800', color: AppColors.textSecondary },
  segTextActive: { color: '#FFFFFF' },
  duprBox: {
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingHorizontal: Spacing.three,
  },
  duprRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 12 },
  duprRowDivider: { borderTopWidth: 1, borderTopColor: AppColors.border },
  duprRowText: { flex: 1, gap: 2 },
  duprRowTitle: { fontSize: 15, fontWeight: '700', color: AppColors.textPrimary },
  duprRowSub: { fontSize: 12, lineHeight: 17, color: AppColors.textSecondary },
  duprRowWarn: { fontSize: 12, lineHeight: 17, fontWeight: '700', color: '#F59E0B', marginTop: 2 },
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
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  modalKeyboard: { flex: 1, justifyContent: 'flex-end' },
  modalCard: {
    maxHeight: '82%',
    backgroundColor: AppColors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: AppColors.border,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  modalContent: { gap: Spacing.three },
  modalTitle: { fontSize: 18, fontWeight: '800', color: AppColors.textPrimary },
  modalSub: { fontSize: 13, color: AppColors.textSecondary },
  modalInput: { borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: AppColors.border, padding: 12, fontSize: 15, color: AppColors.textPrimary, backgroundColor: AppColors.surfaceSoft },
  modalTextarea: { minHeight: 88 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
