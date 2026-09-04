import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BusinessFooter } from '@/components/business-footer';
import { Spacing } from '@/constants/theme';
import { AppAlert as Alert } from '@/lib/feedback';

// 고객지원·문의 창구. DUPR RaaS 운영요건: 매치 분쟁 등 사용자가 지원팀에 연락할
// 명확한 방법을 제공해야 한다. 이메일로 안내한다.
// 대표 주소는 support@pinut.org, 실제 수신 확보를 위해 운영자 메일로도 함께(cc) 보낸다.
const SUPPORT_EMAIL = 'support@pinut.org';
const SUPPORT_CC = 'troy.yoonsik.shin@gmail.com';

async function contact(subjectPrefix: string) {
  const url =
    `mailto:${SUPPORT_EMAIL}?cc=${encodeURIComponent(SUPPORT_CC)}` +
    `&subject=${encodeURIComponent(`[피넛 문의] ${subjectPrefix}`)}`;
  const ok = await Linking.canOpenURL(url).catch(() => false);
  if (ok) Linking.openURL(url);
  else Alert.alert('문의 이메일', `${SUPPORT_EMAIL} 로 메일 주시면 도와드릴게요.`);
}

export default function SupportScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>도움이 필요하신가요?</Text>
        <Text style={styles.lead}>문의·불편사항은 아래로 연락 주세요. 최대한 빠르게 도와드릴게요.</Text>

        <Row
          icon="alert-circle-outline"
          title="경기·레이팅 분쟁 신고"
          sub="DUPR 인증 경기 결과·레이팅 관련 이의는 여기로"
          onPress={() => contact('경기/레이팅 분쟁')}
        />
        <Row
          icon="chatbubble-ellipses-outline"
          title="일반 문의"
          sub="계정·모임·대회 등 그 밖의 문의"
          onPress={() => contact('일반 문의')}
        />
        <Row
          icon="mail-outline"
          title={SUPPORT_EMAIL}
          sub="지원 이메일 (탭하면 메일 열기)"
          onPress={() => contact('문의')}
        />

        <Text style={styles.note}>
          DUPR 공식 레이팅 관련 정정은 접수 후 확인하여 필요한 경우 DUPR에 정정 요청까지 처리해 드립니다.
        </Text>

        {/* 사업자 정보 — 전자상거래 표시 의무 + PG 심사 요건 */}
        <BusinessFooter />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color="#16C784" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#707B87" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  content: { padding: Spacing.four, gap: Spacing.three },
  title: { fontSize: 24, fontWeight: '800', color: '#F8FAFC' },
  lead: { fontSize: 15, lineHeight: 22, color: '#AAB4C0', marginBottom: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: '#10161D',
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 14, borderCurve: 'continuous', backgroundColor: 'rgba(22,199,132,0.12)', alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15.5, fontWeight: '800', color: '#F8FAFC' },
  rowSub: { fontSize: 13, color: '#AAB4C0', marginTop: 2 },
  note: { fontSize: 12.5, color: '#707B87', lineHeight: 18, marginTop: Spacing.two },
});
