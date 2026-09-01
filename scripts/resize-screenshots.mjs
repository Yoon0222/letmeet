// 앱스토어 스크린샷 리사이즈. 사용: node scripts/resize-screenshots.mjs [WIDTH] [HEIGHT]
// 기본 1284x2778 (6.7"). 6.9"는 1290 2796, 6.5"는 1242 2688.
import sharp from 'sharp';
import { readdirSync, mkdirSync } from 'fs';
import { join, extname, basename } from 'path';

const W = parseInt(process.argv[2] ?? '1284', 10);
const H = parseInt(process.argv[3] ?? '2778', 10);
const SRC = 'docs/appstore-screenshots/upload-src';
const OUT = 'docs/appstore-screenshots/upload-out';
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => /\.(png|jpe?g)$/i.test(f));
if (files.length === 0) { console.log(`'${SRC}' 에 이미지가 없어요. 스크린샷을 넣어주세요.`); process.exit(0); }

console.log(`대상 크기: ${W}x${H} · ${files.length}개 처리`);
for (const f of files) {
  const out = join(OUT, basename(f, extname(f)) + '.png');
  const meta = await sharp(join(SRC, f)).metadata();
  await sharp(join(SRC, f)).resize(W, H, { fit: 'fill' }).png().toFile(out);
  console.log(`  ${f} (${meta.width}x${meta.height}) -> ${basename(out)} (${W}x${H})`);
}
console.log(`완료 → ${OUT}`);
