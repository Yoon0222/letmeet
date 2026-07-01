import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

// 카카오 브랜드 가이드: 노란 배경 #FEE500 + 검정 텍스트
const KAKAO_YELLOW = '#FEE500';
const KAKAO_LABEL = '#191600';

interface KakaoButtonProps {
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function KakaoButton({ onPress, loading = false, disabled, style }: KakaoButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: KAKAO_YELLOW, opacity: isDisabled ? 0.6 : pressed ? 0.9 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={KAKAO_LABEL} />
      ) : (
        <>
          <Ionicons name="chatbubble-sharp" size={18} color={KAKAO_LABEL} />
          <Text style={styles.label}>카카오로 시작하기</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: { fontSize: 16, fontWeight: '700', color: KAKAO_LABEL },
});
