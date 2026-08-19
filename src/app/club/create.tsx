import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useLoading } from '@/contexts/loading';
import { supabase } from '@/lib/supabase';

export default function CreateClub() {
  const router = useRouter();
  const { session } = useAuth();
  const { show, hide } = useLoading();

  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState<'free' | 'premium'>('free');
  const [saving, setSaving] = useState(false);

  async function onSubmit() {
    if (!name.trim()) {
      Alert.alert('입력 확인', '클럽 이름을 입력해주세요.');
      return;
    }
    if (!session?.user.id) return;
    setSaving(true);
    show();
    const trialEnd = new Date();
    trialEnd.setMonth(trialEnd.getMonth() + 1);
    const { data, error } = await supabase
      .from('clubs')
      .insert({
        owner_id: session.user.id,
        name: name.trim(),
        region: region.trim(),
        description: description.trim(),
        require_approval: true, // 클럽 가입은 항상 운영자 승인제
        tier: plan === 'premium' ? 'premium' : 'free',
        premium_status: plan === 'premium' ? 'trialing' : 'none',
        premium_started_at: plan === 'premium' ? new Date().toISOString() : null,
        premium_trial_ends_at: plan === 'premium' ? trialEnd.toISOString() : null,
      })
      .select('id')
      .single();
    setSaving(false);
    hide();
    if (error) {
      Alert.alert('생성 실패', error.message);
      return;
    }
    router.replace(`/club/${data.id}`);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="클럽 이름"
          value={name}
          onChangeText={setName}
          placeholder="예: 송파 피클볼 클럽"
          maxLength={30}
        />
        <TextField label="활동 지역" value={region} onChangeText={setRegion} placeholder="예: 서울 송파구" />
        <TextField
          label="소개 (선택)"
          value={description}
          onChangeText={setDescription}
          placeholder="클럽 소개, 정기 모임 시간, 회비 등"
          multiline
          maxLength={300}
          style={{ minHeight: 110, textAlignVertical: 'top' }}
        />
        <View style={styles.planSection}>
          <Text style={styles.sectionTitle}>클럽 플랜</Text>
          <View style={styles.planGrid}>
            <PlanCard
              title="일반 클럽"
              subtitle="멤버 모집과 클럽 소개를 먼저 시작해요."
              icon="people-outline"
              selected={plan === 'free'}
              onPress={() => setPlan('free')}
            />
            <PlanCard
              title="프리미엄"
              subtitle="1개월 무료 체험으로 경기 결과 관리를 사용해요."
              icon="sparkles-outline"
              selected={plan === 'premium'}
              onPress={() => setPlan('premium')}
            />
          </View>
          {plan === 'premium' ? (
            <View style={styles.benefitBox}>
              <Benefit text="클럽 모임 대진 짜기" />
              <Text style={styles.benefitSubText}>참석 투표를 바탕으로 클럽 인원 실력별 자동 대진을 만들 수 있어요.</Text>
              <Benefit text="경기 결과 기록" />
              <Benefit text="월례대회 기능 제공" />
              <Text style={styles.benefitSubText}>토너먼트, 리그전 등 클럽 내부 대회를 운영할 수 있어요.</Text>
              <Text style={styles.benefitNote}>첫 1개월은 무료 체험으로 시작돼요.</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.noteRow}>
          <Text style={styles.noteText}>가입은 신청 후 운영자(클럽장) 승인으로 확정돼요.</Text>
        </View>
        <Button title="클럽 만들기" onPress={onSubmit} loading={saving} style={{ marginTop: Spacing.two }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PlanCard({
  title,
  subtitle,
  icon,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.planCard, selected && styles.planCardSelected]}>
      <View style={[styles.planIcon, selected && styles.planIconSelected]}>
        <Ionicons name={icon} size={19} color={selected ? '#07110C' : '#AAB4C0'} />
      </View>
      <View style={styles.planText}>
        <Text style={[styles.planTitle, selected && styles.planTitleSelected]}>{title}</Text>
        <Text style={styles.planSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? '#16C784' : '#707B87'} />
    </Pressable>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <View style={styles.benefitRow}>
      <Ionicons name="checkmark" size={15} color="#16C784" />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#070A0D' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 60 },
  planSection: { gap: 12 },
  sectionTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' },
  planGrid: { gap: 10 },
  planCard: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
  },
  planCardSelected: {
    borderColor: '#16C784',
    backgroundColor: 'rgba(22,199,132,0.12)',
  },
  planIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151D25',
  },
  planIconSelected: { backgroundColor: '#9BE137' },
  planText: { flex: 1, gap: 4 },
  planTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '900' },
  planTitleSelected: { color: '#16C784' },
  planSubtitle: { color: '#AAB4C0', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  benefitBox: {
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
    gap: 9,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitText: { flex: 1, color: '#F8FAFC', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  benefitSubText: { color: '#AAB4C0', fontSize: 12, lineHeight: 17, fontWeight: '600', paddingLeft: 23, marginTop: -4 },
  benefitNote: { color: '#AAB4C0', fontSize: 12, lineHeight: 17, fontWeight: '600', marginTop: 2 },
  noteRow: {
    backgroundColor: 'rgba(22,199,132,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22,199,132,0.22)',
    borderRadius: 18,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
  noteText: { fontSize: 13, color: '#16C784', fontWeight: '700' },
});
