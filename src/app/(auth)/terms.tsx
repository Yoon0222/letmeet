import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

// 이용약관(EULA) — App Store 가이드라인 1.2(UGC) 대응.
//   · 유해 콘텐츠/악성 사용자에 대한 '무관용(zero tolerance)' 명시
//   · 신고·차단 수단 안내 + 위반 시 제재(24시간 내 조치·계정 정지)
export default function Terms() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={24} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>이용약관</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>피넛(PEANUT) 서비스 이용약관 · 최종 개정 2026-08-24</Text>

        <Section title="제1조 (목적 및 동의)">
          본 약관은 피넛(이하 &ldquo;서비스&rdquo;) 이용에 관한 조건과 절차, 이용자와 회사의 권리·의무를 정합니다.
          서비스에 가입하거나 로그인함으로써 이용자는 본 약관에 동의한 것으로 봅니다.
        </Section>

        <Section title="제2조 (금지 행위 및 무관용 원칙)">
          <Text style={styles.bold}>
            본 서비스는 불쾌하거나 유해한 콘텐츠(objectionable content) 및 악의적·모욕적 행위(abusive behavior)에 대해
            무관용(zero tolerance) 원칙을 적용합니다.
          </Text>
          {' '}다음 행위는 엄격히 금지되며, 위반 시 사전 통지 없이 콘텐츠 삭제 및 계정 이용이 정지·해지될 수 있습니다.
          {'\n\n'}
          • 욕설·비방·괴롭힘·차별·혐오 표현{'\n'}
          • 음란물, 폭력적·불법적 콘텐츠{'\n'}
          • 타인 사칭, 스팸, 사기, 개인정보 무단 수집·게시{'\n'}
          • 그 밖에 타인에게 피해를 주거나 법령·공서양속에 반하는 행위
        </Section>

        <Section title="제3조 (신고 및 차단)">
          이용자는 앱 내에서 부적절한 게시물·프로필을 <Text style={styles.bold}>신고</Text>하거나 특정 사용자를{' '}
          <Text style={styles.bold}>차단</Text>할 수 있습니다.
          각 게시물·프로필·모임 화면의 신고/차단 메뉴(⋯ 또는 신고 아이콘)를 통해 즉시 이용할 수 있으며,
          차단한 사용자의 콘텐츠는 더 이상 노출되지 않습니다.
        </Section>

        <Section title="제4조 (신고 처리 및 제재)">
          회사는 접수된 신고를 검토하여 <Text style={styles.bold}>24시간 이내에</Text> 유해 콘텐츠 삭제, 이용자 이용 제한 등
          필요한 조치를 취합니다. 위반 정도에 따라 경고 없이 계정이 영구 정지될 수 있습니다.
        </Section>

        <Section title="제5조 (이용자의 책임)">
          이용자는 본인이 게시한 콘텐츠에 대해 책임을 지며, 타인의 권리를 침해하지 않아야 합니다.
          회사는 이용자 간 분쟁이나 이용자가 게시한 콘텐츠로 인한 손해에 대해 관련 법령이 허용하는 범위에서 책임을 지지 않습니다.
        </Section>

        <Section title="제6조 (개정)">
          회사는 필요 시 본 약관을 개정할 수 있으며, 개정 시 앱 내 공지합니다. 개정 이후에도 서비스를 계속 이용하는 경우
          변경된 약관에 동의한 것으로 봅니다.
        </Section>

        <Text style={styles.footer}>문의: support@pinut.org</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderBottomWidth: 1, borderBottomColor: '#EEF0F3' },
  close: { width: 24, alignItems: 'flex-start' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  content: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.three },
  updated: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  section: { gap: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  body: { fontSize: 14, lineHeight: 22, color: '#374151' },
  bold: { fontWeight: '800', color: '#111827' },
  footer: { fontSize: 13, color: '#9CA3AF', marginTop: Spacing.two },
});
