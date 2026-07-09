import { Image } from 'expo-image';

import { PEANUT_AVATARS, peanutFromUrl, peanutIndexFor } from '@/constants/avatars';

interface AvatarProps {
  /** 사진이 없을 때 기본 피넛을 정하는 시드(닉네임 등). */
  nickname?: string;
  /** 업로드된 사진 URL 또는 'peanut:NN'. 없으면 시드 기반 기본 피넛. */
  uri?: string | null;
  size?: number;
}

export function Avatar({ nickname, uri, size = 44 }: AvatarProps) {
  const radius = size / 2;

  const chosen = peanutFromUrl(uri); // 'peanut:NN' 선택값
  const source =
    chosen != null
      ? PEANUT_AVATARS[chosen]
      : uri
        ? { uri } // 업로드된 원격 사진
        : PEANUT_AVATARS[peanutIndexFor(nickname || '?')]; // 기본: 시드 기반 피넛

  return (
    <Image
      source={source}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#E5E7EB', borderWidth: 2, borderColor: '#FFFFFF' }}
      contentFit="cover"
    />
  );
}
