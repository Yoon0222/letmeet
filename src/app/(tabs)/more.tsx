import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BusinessFooter } from '@/components/business-footer';
import { Avatar } from '@/components/ui/avatar';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';

const dark = {
  background: '#070A0D',
  surface: '#10161D',
  surfaceSoft: '#151D25',
  line: 'rgba(255,255,255,0.09)',
  text: '#F8FAFC',
  textSecondary: '#AAB4C0',
  textMuted: '#707B87',
};

const primaryItems = [
  { title: '대회', subtitle: '참가 가능한 대회와 경기표', icon: 'trophy-outline', href: '/(tabs)/tournaments' },
  { title: '클럽', subtitle: '추천 클럽과 내 클럽', icon: 'people-outline', href: '/(tabs)/clubs' },
  { title: '내 예약', subtitle: '예약한 코트 일정 확인', icon: 'calendar-outline', href: '/court/reservations' },
] as const;

const secondaryItems = [
  { title: '내 정보', icon: 'person-outline', href: '/(tabs)/profile' },
  { title: '프로필 수정', icon: 'create-outline', href: '/profile/edit' },
  { title: '연결된 로그인', icon: 'link-outline', href: '/profile/connections' },
  { title: '알림', icon: 'notifications-outline', href: '/notifications' },
] as const;

export default function MoreScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.logo}>
            P!<Text style={styles.logoAccent}>NUT</Text>
          </Text>
          <Text style={styles.title}>전체</Text>
          <Text style={styles.subtitle}>대회, 클럽, 예약과 계정 메뉴를 한곳에서 확인하세요.</Text>
        </View>

        <Pressable style={styles.profileCard} onPress={() => router.push('/(tabs)/profile' as never)}>
          <View>
            <Avatar nickname={profile?.nickname ?? 'P!NUT'} uri={profile?.avatar_url} size={64} />
            <View style={styles.onlineDot} />
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName} numberOfLines={1}>
              {profile?.nickname ?? 'P!NUT Player'}
            </Text>
            <Text style={styles.profileMeta} numberOfLines={1}>
              {profile?.region || '지역 미설정'} · 내 정보 보기
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={dark.textMuted} />
        </Pressable>

        <View style={styles.grid}>
          {primaryItems.map((item) => (
            <Pressable key={item.title} style={styles.featureCard} onPress={() => router.push(item.href as never)}>
              <View style={styles.featureIcon}>
                <Ionicons name={item.icon} size={22} color={Brand.primary} />
              </View>
              <Text style={styles.featureTitle}>{item.title}</Text>
              <Text style={styles.featureSubtitle}>{item.subtitle}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>계정과 설정</Text>
          <View style={styles.listCard}>
            {secondaryItems.map((item, index) => (
              <Pressable
                key={item.title}
                style={[styles.row, index < secondaryItems.length - 1 && styles.rowBorder]}
                onPress={() => router.push(item.href as never)}>
                <View style={styles.rowIcon}>
                  <Ionicons name={item.icon} size={18} color={dark.textSecondary} />
                </View>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Ionicons name="chevron-forward" size={16} color={dark.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* 사업자 정보 — 전자상거래 표시 의무 + PG 심사 요건 */}
        <BusinessFooter compact />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: dark.background },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, gap: Spacing.four, paddingBottom: 124 },
  header: { gap: 7 },
  logo: { fontSize: 17, fontWeight: '900', color: dark.text, letterSpacing: 0 },
  logoAccent: { color: Brand.primary },
  title: { fontSize: 32, fontWeight: '900', color: dark.text, letterSpacing: 0, marginTop: 8 },
  subtitle: { fontSize: 14, fontWeight: '600', lineHeight: 21, color: dark.textSecondary },
  profileCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 2,
  },
  onlineDot: { position: 'absolute', right: 0, bottom: 1, width: 16, height: 16, borderRadius: 8, backgroundColor: Brand.primary, borderWidth: 3, borderColor: dark.background },
  profileText: { flex: 1, gap: 4 },
  profileName: { fontSize: 20, fontWeight: '900', color: dark.text },
  profileMeta: { fontSize: 13, fontWeight: '600', color: dark.textMuted },
  grid: { flexDirection: 'row', gap: Spacing.two },
  featureCard: {
    flex: 1,
    minHeight: 116,
    padding: Spacing.two,
    borderRadius: 8,
    borderCurve: 'continuous',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.line,
    gap: 7,
    alignItems: 'center',
  },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,199,132,0.12)',
  },
  featureTitle: { fontSize: 15, fontWeight: '900', color: dark.text, textAlign: 'center' },
  featureSubtitle: { fontSize: 11, fontWeight: '600', lineHeight: 16, color: dark.textMuted, textAlign: 'center' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: dark.text },
  listCard: {
    backgroundColor: 'transparent',
  },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: dark.line },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: dark.surfaceSoft,
  },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: dark.text },
});
