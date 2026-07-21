// Apple "Sign in with Apple" client secret (JWT, ES256) 생성기.
// Supabase Apple provider 의 "Secret Key (for OAuth)" 칸에 넣을 JWT 를 만든다.
// Apple 규칙: 만료 최대 6개월 → 여기선 180일. 만료되면 다시 실행해 재발급.
//
// 의존성 없음(Node 내장 crypto). 사용법:
//   node scripts/apple-secret.js \
//     --team 67RZ7ZY4YD \
//     --kid UJNC75BF5P \
//     --iss-services com.pinut.app.signin \
//     --p8 "C:/Users/SEPC/Documents/P!nut/02_Business/AuthKey_UJNC75BF5P.p8"
//
// 출력된 JWT 를 Supabase(dev·prod 각각) Apple provider Secret Key 칸에 붙여넣기.
const crypto = require('crypto');
const fs = require('fs');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const teamId = arg('team');
const keyId = arg('kid');
const clientId = arg('iss-services'); // Services ID (= sub/client_id)
const p8Path = arg('p8');
const days = Number(arg('days', '180'));

if (!teamId || !keyId || !clientId || !p8Path) {
  console.error('필수: --team <TeamID> --kid <KeyID> --iss-services <ServicesID> --p8 <.p8 경로>');
  process.exit(1);
}

const privateKey = fs.readFileSync(p8Path, 'utf8');
const now = Math.floor(Date.now() / 1000);
const exp = now + days * 24 * 60 * 60;

const header = { alg: 'ES256', kid: keyId };
const payload = {
  iss: teamId,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: clientId,
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
// ES256 = ECDSA P-256 + SHA-256, JOSE(concat r||s) 포맷
const signature = crypto.sign('sha256', Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: 'ieee-p1363',
});
const jwt = `${signingInput}.${b64url(signature)}`;

console.log('\n=== Apple client secret (JWT) — Supabase Apple "Secret Key (for OAuth)" 칸에 붙여넣기 ===\n');
console.log(jwt);
console.log(`\n만료: ${new Date(exp * 1000).toISOString()} (${days}일 후) — 만료 전 재실행해 재발급\n`);
