import Image from 'next/image';

import { avatarSrc } from '@/lib/avatars';

// 참가자 아바타 (피넛 기본 or 업로드 사진)
export function Avatar({ url, nickname, size = 22 }: { url?: string | null; nickname: string; size?: number }) {
  return (
    <Image
      src={avatarSrc(url, nickname)}
      alt={nickname}
      width={size}
      height={size}
      unoptimized
      className="shrink-0 rounded-full bg-slate-100 object-cover ring-1 ring-slate-200"
      style={{ width: size, height: size }}
    />
  );
}
