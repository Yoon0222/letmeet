import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// 네이티브 결제수단 선택 화면(방식 B). 여기서 수단을 고르고 '결제하기'를 누르면
// 앱 안 WebView(payment/webview)로 넘어가 토스가 그 수단으로 곧장 결제창을 띄운다.
// 결제수단 선택은 웹뷰가 아니라 우리가 네이티브로 그린다(자체 UI).
type Method = {
  id: string;
  label: string;
  desc?: string;
  method: 'CARD' | 'TRANSFER';
  easyPay?: string; // 간편결제 코드(있으면 그 수단으로 직행)
  icon: keyof typeof Ionicons.glyphMap;
};

const METHODS: Method[] = [
  { id: 'kakaopay', label: '카카오페이', method: 'CARD', easyPay: 'KAKAOPAY', icon: 'chatbubble' },
  { id: 'naverpay', label: '네이버페이', method: 'CARD', easyPay: 'NAVERPAY', icon: 'leaf' },
  { id: 'tosspay', label: '토스페이', method: 'CARD', easyPay: 'TOSSPAY', icon: 'card' },
  { id: 'payco', label: 'PAYCO', method: 'CARD', easyPay: 'PAYCO', icon: 'wallet' },
  { id: 'card', label: '신용·체크카드', desc: '카드 정보 입력', method: 'CARD', icon: 'card-outline' },
  { id: 'transfer', label: '계좌이체', desc: '실시간 계좌이체', method: 'TRANSFER', icon: 'business-outline' },
];

export default function PaymentMethodScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string; amount?: string; orderName?: string; pid?: string }>();

  const amount = Number(params.amount ?? '0');
  const orderName = String(params.orderName ?? '피넛 결제');
  const [selected, setSelected] = useState<string>('kakaopay');

  function proceed() {
    const m = METHODS.find((x) => x.id === selected) ?? METHODS[0];
    router.replace({
      pathname: '/payment/webview',
      params: {
        orderId: String(params.orderId ?? ''),
        amount: String(amount),
        orderName,
        pid: String(params.pid ?? ''),
        method: m.method,
        easyPay: m.easyPay ?? '',
      },
    } as never);
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 결제 금액 */}
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>결제 금액</Text>
          <View style={styles.amountRow}>
            <Text style={[styles.orderName, { color: theme.textSecondary }]} numberOfLines={1}>
              {orderName}
            </Text>
            <Text style={[styles.amount, { color: theme.text }]}>{amount.toLocaleString()}원</Text>
          </View>
        </View>

        {/* 결제 방법 */}
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>결제 방법</Text>
          <View style={{ gap: Spacing.one }}>
            {METHODS.map((m) => {
              const on = selected === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setSelected(m.id)}
                  style={[
                    styles.method,
                    { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.backgroundSelected : theme.card },
                  ]}
                >
                  <View style={[styles.methodIcon, { backgroundColor: theme.background }]}>
                    <Ionicons name={m.icon} size={18} color={on ? theme.primary : theme.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.methodLabel, { color: theme.text }]}>{m.label}</Text>
                    {m.desc ? <Text style={[styles.methodDesc, { color: theme.tabIconDefault }]}>{m.desc}</Text> : null}
                  </View>
                  <Ionicons
                    name={on ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={on ? theme.primary : theme.tabIconDefault}
                  />
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.notice, { color: theme.tabIconDefault }]}>
            카드는 입력 화면이 잠깐 열리고, 간편결제는 해당 앱이 실행돼요.
          </Text>
        </View>
      </ScrollView>

      {/* 하단 결제 버튼 */}
      <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <Button title={`${amount.toLocaleString()}원 결제하기`} onPress={proceed} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.three },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  orderName: { fontSize: 14, flexShrink: 1 },
  amount: { fontSize: 22, fontWeight: '900' },
  method: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: Spacing.two + 2,
  },
  methodIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  methodLabel: { fontSize: 15, fontWeight: '700' },
  methodDesc: { fontSize: 12, marginTop: 1 },
  notice: { fontSize: 12, marginTop: Spacing.one, lineHeight: 17 },
  footer: { padding: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
});
