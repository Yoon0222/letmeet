import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  const { preset } = useLocalSearchParams<{ preset?: string }>();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const { show, hide } = useLoading();

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [region, setRegion] = useState('');
  const [courtId, setCourtId] = useState<string | null>(null); // 등록 코트 연결(선택) (0046)
  const [description, setDescription] = useState('');
  const [start, setStart] = useState<Date>(() => {
    if (!preset) return defaultStart();
    const parsed = new Date(preset);
    return Number.isNaN(parsed.getTime()) ? defaultStart() : parsed;
  });
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
  const [step, setStep] = useState<1 | 2 | 3>(1);

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

  function nextStep() {
    if (step === 1 && (!title.trim() || !location.trim())) {
      Alert.alert('입력 확인', '제목과 장소를 입력해주세요.');
      return;
    }
    if (step === 2 && skillMin > skillMax) {
      Alert.alert('실력 범위', '최소 실력이 최대 실력보다 클 수 없습니다.');
      return;
    }
    setStep((current) => Math.min(3, current + 1) as 1 | 2 | 3);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.progressWrap}>
        <View style={styles.progressTop}>
          <Text style={styles.progressCount}><Text style={styles.progressCurrent}>{step}</Text> / 3</Text>
        </View>
        <View style={styles.progressRow}>
          {(['기본 정보', '참가 조건', '확인'] as const).map((label, index) => {
            const number = (index + 1) as 1 | 2 | 3;
            const complete = step > number;
            const active = step === number;
            return <View key={label} style={styles.progressItem}>
              <View style={[styles.progressDot, (active || complete) && styles.progressDotActive]}>
                {complete ? <Ionicons name="checkmark" size={15} color="#07100D" /> : <Text style={[styles.progressNumber, active && styles.progressNumberActive]}>{number}</Text>}
              </View>
              <Text style={[styles.progressLabel, active && styles.progressLabelActive]}>{label}</Text>
            </View>;
          })}
          <View style={styles.progressLine} />
          <View style={[styles.progressLine, styles.progressLineRight, step > 2 && styles.progressLineActive]} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 1 ? <>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>기본 정보</Text><Text style={styles.sectionSub}>언제, 어디서 어떤 모임을 만들까요?</Text></View>
          <TextField label="제목" value={title} onChangeText={setTitle} placeholder="예: 평일 저녁 즐겜 복식" maxLength={40} />
          <CourtPicker value={{ name: location, region, courtId }} onChange={(v) => { setLocation(v.name); setRegion(v.region); setCourtId(v.courtId); }} />
          {!courtId && location.trim().length > 0 ? <Pressable onPress={() => setReqOpen(true)} style={styles.reqLink}><Ionicons name="add-circle-outline" size={16} color="#16C784" /><Text style={styles.reqLinkText}>이 코트가 목록에 없나요? 코트 등록 요청</Text></Pressable> : null}
          <TextField label="지역" value={region} onChangeText={setRegion} placeholder="예: 서울 송파구" />
          <View style={styles.field}><Text style={styles.label}>날짜 · 시간</Text><Pressable onPress={openPicker} style={styles.dateBtn}><Ionicons name="calendar-outline" size={20} color="#16C784" /><Text style={styles.dateTxt}>{formatMeetupTime(start.toISOString())}</Text><Ionicons name="chevron-forward" size={18} color={AppColors.textSecondary} style={{ marginLeft: 'auto' }} /></Pressable>{Platform.OS === 'ios' && showIosPicker ? <DateTimePicker value={start} mode="datetime" display="inline" minimumDate={new Date()} onChange={(_e, date) => date && setStart(date)} /> : null}</View>
        </> : null}

        {step === 2 ? <>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>참가 조건</Text><Text style={styles.sectionSub}>함께할 플레이어 조건을 정해주세요</Text></View>
          <View style={styles.settingsPanel}>
            <View style={styles.settingRow}><Text style={styles.settingTitle}>종목</Text><View style={styles.compactSeg}>{([{ key: 'doubles', label: '복식' }, { key: 'singles', label: '단식' }, { key: 'any', label: '자유' }] as const).map((d) => <Pressable key={d.key} onPress={() => setDiscipline(d.key)} style={[styles.compactSegBtn, discipline === d.key && styles.compactSegActive]}><Text style={[styles.compactSegText, discipline === d.key && styles.compactSegTextActive]}>{d.label}</Text></Pressable>)}</View></View>
            <View style={styles.settingRow}><Text style={styles.settingTitle}>정원</Text><View style={styles.inlineStepper}><Pressable onPress={() => setMaxPlayers((v) => Math.max(2, v - 1))} style={styles.inlineStepBtn}><Text style={styles.stepTxt}>−</Text></Pressable><Text style={styles.inlineValue}>{maxPlayers}명</Text><Pressable onPress={() => setMaxPlayers((v) => Math.min(32, v + 1))} style={styles.inlineStepBtn}><Text style={styles.stepTxt}>+</Text></Pressable></View></View>
            <View style={styles.settingRow}><Text style={styles.settingTitle}>실력 범위</Text><View style={styles.skillInline}><Pressable onPress={() => adjust(setSkillMin as any, -0.5, 2, 8)} hitSlop={8}><Text style={styles.stepTxt}>−</Text></Pressable><Text style={styles.inlineValue}>{skillMin.toFixed(1)} — {skillMax.toFixed(1)}</Text><Pressable onPress={() => adjust(setSkillMax as any, 0.5, 2, 8)} hitSlop={8}><Text style={styles.stepTxt}>+</Text></Pressable></View></View>
          </View>
          <TextField label="게스트비 (원)" value={fee} onChangeText={(v) => setFee(v.replace(/[^0-9]/g, ''))} placeholder="0 (무료). 예: 5000" keyboardType="number-pad" hint={fee && parseInt(fee, 10) > 0 ? `참가자에게 ${parseInt(fee, 10).toLocaleString()}원으로 표시돼요` : '비워두면 무료로 표시돼요'} />
          <View style={styles.field}><Text style={styles.label}>DUPR 설정</Text><View style={styles.duprBox}><View style={styles.duprRow}><View style={styles.duprRowText}><Text style={styles.duprRowTitle}>DUPR 인증 번개</Text><Text style={styles.duprRowSub}>DUPR 연결 회원만 참가하고 결과를 공식 레이팅에 반영해요.</Text>{!duprConnected ? <Text style={styles.duprRowWarn}>호스트가 먼저 DUPR을 연결해야 켤 수 있어요</Text> : !duprEligible ? <Text style={styles.duprRowWarn}>BASIC 자격 확인 후 사용할 수 있어요</Text> : null}</View><Switch value={duprCertified} onValueChange={(v) => { if (v && !duprEligible) { Alert.alert('DUPR 연결이 필요해요', '프로필에서 DUPR 연결과 BASIC 자격을 먼저 확인해주세요.'); return; } setDuprCertified(v); if (!v) setDuprPremium(false); }} trackColor={{ false: AppColors.border, true: '#2D6BD6' }} thumbColor="#FFFFFF" /></View>{duprCertified ? <View style={[styles.duprRow, styles.duprRowDivider]}><View style={styles.duprRowText}><Text style={[styles.duprRowTitle, { color: '#8B5CF6' }]}>DUPR+ 전용</Text><Text style={styles.duprRowSub}>PREMIUM + VERIFIED 자격 회원만 참가할 수 있어요.</Text></View><Switch value={duprPremium} onValueChange={setDuprPremium} trackColor={{ false: AppColors.border, true: '#8B5CF6' }} thumbColor="#FFFFFF" /></View> : null}</View></View>
          <View style={styles.approvalNote}><Ionicons name="shield-checkmark-outline" size={20} color="#16C784" /><Text style={styles.approvalNoteText}>참가는 호스트 승인제로 진행돼요</Text></View>
        </> : null}

        {step === 3 ? <>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>확인</Text><Text style={styles.sectionSub}>내용을 확인하고 모임을 만들어주세요</Text></View>
          <View style={styles.summaryPanel}>
            <SummaryRow label="모임" value={title || '제목 미입력'} />
            <SummaryRow label="장소" value={location || '장소 미입력'} />
            <SummaryRow label="일시" value={formatMeetupTime(start.toISOString())} />
            <SummaryRow label="조건" value={`${discipline === 'doubles' ? '복식' : discipline === 'singles' ? '단식' : '자유'} · ${maxPlayers}명 · ${skillMin.toFixed(1)}–${skillMax.toFixed(1)}`} />
            <SummaryRow label="게스트비" value={fee && parseInt(fee, 10) > 0 ? `${parseInt(fee, 10).toLocaleString()}원` : '무료'} />
            <SummaryRow label="DUPR" value={duprPremium ? 'DUPR+ 전용' : duprCertified ? '인증 번개' : '일반 번개'} />
          </View>
          <TextField label="설명 (선택)" value={description} onChangeText={setDescription} placeholder="모임 안내, 준비물, 비용 등" multiline maxLength={300} style={{ minHeight: 110, textAlignVertical: 'top' }} />
        </> : null}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {step > 1 ? <Pressable onPress={() => setStep((current) => Math.max(1, current - 1) as 1 | 2 | 3)} style={styles.previousButton}><Text style={styles.previousText}>이전</Text></Pressable> : null}
        <Pressable onPress={step === 3 ? onSubmit : nextStep} disabled={saving} style={[styles.nextButton, step === 1 && { flex: 1 }]}><Text style={styles.nextText}>{saving ? '생성 중...' : step === 3 ? '모임 만들기' : '다음'}</Text></Pressable>
      </View>

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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: AppColors.background },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 32 },
  progressWrap: { paddingHorizontal: Spacing.four, paddingTop: 10, paddingBottom: Spacing.three },
  progressTop: { alignItems: 'flex-end', marginBottom: 4 },
  progressCount: { color: AppColors.textSecondary, fontSize: 13, fontWeight: '800' },
  progressCurrent: { color: AppColors.primary },
  progressRow: { position: 'relative', flexDirection: 'row', justifyContent: 'space-between' },
  progressItem: { width: '30%', alignItems: 'center', gap: 5, zIndex: 2 },
  progressDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border },
  progressDotActive: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  progressNumber: { color: AppColors.textSecondary, fontSize: 13, fontWeight: '800' },
  progressNumberActive: { color: '#07100D' },
  progressLabel: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '700' },
  progressLabelActive: { color: AppColors.primary },
  progressLine: { position: 'absolute', left: '16%', right: '50%', top: 13, height: 2, backgroundColor: AppColors.primary },
  progressLineRight: { left: '50%', right: '16%', backgroundColor: AppColors.border },
  progressLineActive: { backgroundColor: AppColors.primary },
  sectionHeader: { gap: 3, marginBottom: Spacing.two },
  sectionTitle: { fontSize: 25, fontWeight: '900', color: AppColors.textPrimary },
  sectionSub: { fontSize: 14, color: AppColors.textSecondary },
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
  settingsPanel: { borderRadius: 8, borderWidth: 1, borderColor: AppColors.border, backgroundColor: AppColors.surface, overflow: 'hidden' },
  settingRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: Spacing.three, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  settingTitle: { color: AppColors.textPrimary, fontSize: 15, fontWeight: '800' },
  compactSeg: { flex: 1, maxWidth: 230, flexDirection: 'row', borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, overflow: 'hidden' },
  compactSegBtn: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  compactSegActive: { backgroundColor: AppColors.primary },
  compactSegText: { color: AppColors.textSecondary, fontSize: 13, fontWeight: '800' },
  compactSegTextActive: { color: '#07100D' },
  inlineStepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inlineStepBtn: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.surfaceSoft, borderWidth: 1, borderColor: AppColors.border },
  inlineValue: { minWidth: 54, textAlign: 'center', color: AppColors.textPrimary, fontSize: 16, fontWeight: '900' },
  skillInline: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 8,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
  approvalNoteText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '700', color: AppColors.textPrimary },
  summaryPanel: { borderRadius: 8, borderWidth: 1, borderColor: AppColors.border, backgroundColor: AppColors.surface, overflow: 'hidden' },
  summaryRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: Spacing.three, borderBottomWidth: 1, borderBottomColor: AppColors.border },
  summaryLabel: { width: 68, color: AppColors.textSecondary, fontSize: 13, fontWeight: '700' },
  summaryValue: { flex: 1, color: AppColors.textPrimary, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  bottomBar: { flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.four, paddingTop: 12, borderTopWidth: 1, borderTopColor: AppColors.border, backgroundColor: AppColors.background },
  previousButton: { flex: 0.8, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: AppColors.border },
  previousText: { color: AppColors.textPrimary, fontSize: 16, fontWeight: '900' },
  nextButton: { flex: 1.2, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: AppColors.primary },
  nextText: { color: '#07100D', fontSize: 16, fontWeight: '900' },
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
