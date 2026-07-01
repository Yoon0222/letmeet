import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';

interface AvatarProps {
  nickname: string;
  uri?: string | null;
  size?: number;
}

// 닉네임 → 안정적인 파스텔 배경색
const PALETTE = ['#3DBA6F', '#2D7FF9', '#F5A623', '#E5484D', '#8E5BE5', '#12A4A4'];
function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({ nickname, uri, size = 44 }: AvatarProps) {
  const radius = size / 2;
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
      />
    );
  }
  const initial = (nickname?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: radius, backgroundColor: colorFor(nickname || 'x') || Brand.primary },
      ]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontWeight: '700' },
});
