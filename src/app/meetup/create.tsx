import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
  const [description, setDescription] = useState('');
  const [start, setStart] = useState<Date>(defaultStart());
  const [showIosPicker, setShowIosPicker] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [skillMin, setSkillMin] = useState(2.0);
  const [skillMax, setSkillMax] = useState(8.0);
  const [fee, setFee] = useState(''); // 게스트비(원). 빈값=무료
  const [imageUri, setImageUri] = useState<string | null>(null); // 코트/장소 사진 (로컬 uri, 생성 후 업로드)
  const [saving, setSaving] = useState(false);

  // 코트/장소 사진 선택 (업로드는 모임 생성 후)
  async function pickImage() {
    let ImagePicker: typeof import('expo-image-picker');
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ImagePicker = require('expo-image-picker');
    } catch {
      Alert.alert('사진 첨부', '이 기능은 최신 앱 빌드에서 사용할 수 있어요.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '사진을 첨부하려면 갤러리 접근 권한이 필요해요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.7 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
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
      })
      .select('id')
      .single();
    if (error) {
      setSaving(false);
      hide();
      Alert.alert('생성 실패', error.message);
      return;
    }
    // 사진 첨부 시 생성된 모임에 업로드 (실패해도 모임은 생성됨)
    if (imageUri && data?.id) {
      try {
        const ext = (imageUri.split('.').pop() ?? 'jpg').toLowerCase();
        const path = `${data.id}/cover_${Date.now()}.${ext}`;
        const buf = await fetch(imageUri).then((r) => r.arrayBuffer());
        await supabase.storage.from('meetup-images').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
        const url = supabase.storage.from('meetup-images').getPublicUrl(path).data.publicUrl;
        await supabase.from('meetups').update({ image_url: url }).eq('id', data.id);
      } catch {
        // 사진 업로드 실패는 무시 (상세에서 다시 시도 가능)
      }
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
        <TextField label="장소" value={location} onChangeText={setLocation} placeholder="예: 올림픽공원 피클볼장" />
        <TextField label="지역" value={region} onChangeText={setRegion} placeholder="예: 서울 송파구" />

        <View style={styles.field}>
          <Text style={styles.label}>코트/장소 사진 (선택)</Text>
          {imageUri ? (
            <Pressable onPress={pickImage}>
              <Image source={{ uri: imageUri }} style={styles.photo} />
              <View style={styles.photoEdit}>
                <Ionicons name="camera" size={14} color="#fff" />
                <Text style={styles.photoEditText}>사진 변경</Text>
              </View>
            </Pressable>
          ) : (
            <Pressable onPress={pickImage} style={styles.photoEmpty}>
              <Ionicons name="image-outline" size={22} color="#16C784" />
              <Text style={styles.photoEmptyText}>코트/장소 사진 추가</Text>
            </Pressable>
          )}
        </View>

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
  photo: { width: '100%', height: 160, borderRadius: 12, borderCurve: 'continuous', backgroundColor: '#E5E7EB' },
  photoEdit: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(17,24,39,0.7)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  photoEditText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  photoEmpty: { height: 96, borderRadius: 12, borderCurve: 'continuous', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  photoEmptyText: { fontSize: 14, fontWeight: '700', color: '#16C784' },
});
