import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function ConfigMissing() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Ionicons name="construct-outline" size={56} color={theme.primary} />
        <Text style={[styles.title, { color: theme.text }]}>Supabase 설정이 필요해요</Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          앱을 실행하려면 Supabase 프로젝트 키를 연결해야 합니다.
        </Text>

        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <Step n={1} text="supabase.com 에서 무료 프로젝트를 생성합니다." theme={theme} />
          <Step n={2} text="supabase/schema.sql 내용을 SQL Editor 에 붙여넣고 실행합니다." theme={theme} />
          <Step
            n={3}
            text="Project Settings → API 에서 URL 과 anon key 를 복사합니다."
            theme={theme}
          />
          <Step n={4} text="프로젝트 루트의 .env 파일에 값을 채웁니다." theme={theme} />
          <Step n={5} text="개발 서버를 재시작합니다 (npm start)." theme={theme} />
        </View>

        <Text style={[styles.code, { color: theme.textSecondary, backgroundColor: theme.backgroundElement }]}>
          EXPO_PUBLIC_SUPABASE_URL=...{'\n'}EXPO_PUBLIC_SUPABASE_ANON_KEY=...
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, text, theme }: { n: number; text: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.step}>
      <View style={[styles.num, { backgroundColor: theme.primary }]}>
        <Text style={styles.numText}>{n}</Text>
      </View>
      <Text style={[styles.stepText, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginTop: Spacing.two },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  card: { alignSelf: 'stretch', borderRadius: 16, padding: Spacing.three, gap: Spacing.three, marginTop: Spacing.two },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 21 },
  code: {
    alignSelf: 'stretch',
    fontFamily: 'monospace',
    fontSize: 12,
    padding: Spacing.three,
    borderRadius: 12,
    lineHeight: 20,
  },
});
