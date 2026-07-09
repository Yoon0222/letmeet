import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';

export default function ConfigMissing() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Ionicons name="construct-outline" size={56} color="#16C784" />
        <Text style={styles.title}>Supabase 설정이 필요해요</Text>
        <Text style={styles.body}>앱을 실행하려면 Supabase 프로젝트 키를 연결해야 합니다.</Text>

        <View style={styles.card}>
          <Step n={1} text="supabase.com 에서 무료 프로젝트를 생성합니다." />
          <Step n={2} text="supabase/schema.sql 내용을 SQL Editor 에 붙여넣고 실행합니다." />
          <Step n={3} text="Project Settings → API 에서 URL 과 anon key 를 복사합니다." />
          <Step n={4} text="프로젝트 루트의 .env 파일에 값을 채웁니다." />
          <Step n={5} text="개발 서버를 재시작합니다 (npm start)." />
        </View>

        <Text style={styles.code}>
          EXPO_PUBLIC_SUPABASE_URL=...{'\n'}EXPO_PUBLIC_SUPABASE_ANON_KEY=...
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.num}>
        <Text style={styles.numText}>{n}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { padding: Spacing.four, gap: Spacing.three, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center', marginTop: Spacing.two },
  body: { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    borderCurve: 'continuous',
    padding: Spacing.three,
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#16C784', alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stepText: { flex: 1, fontSize: 14, color: '#111827', lineHeight: 21 },
  code: {
    alignSelf: 'stretch',
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: '#F0F1F3',
    padding: Spacing.three,
    borderRadius: 12,
    lineHeight: 20,
  },
});
