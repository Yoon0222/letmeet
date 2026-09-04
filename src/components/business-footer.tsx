import { StyleSheet, Text, View } from 'react-native';

// 사업자 정보 푸터 — 전자상거래 표시 의무 + PG(토스) 결제경로 심사 요건.
//   값은 사업자등록증과 반드시 일치해야 한다 (토스 APP 결제경로 가이드 유의사항 4).
const BIZ = [
  '상호명 : 피넛',
  '대표자 : 신윤식',
  '사업자등록번호 : 221-14-95232',
  '통신판매업신고 : 면제 사업자',
  '사업장 주소 : 인천광역시 검단구 목지3로 3, 1동 4층 401호',
  '전화번호 : 010-5270-2034',
];

export function BusinessFooter() {
  return (
    <View style={styles.box}>
      {BIZ.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 8,
    padding: 16,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 3,
  },
  line: { fontSize: 11.5, lineHeight: 17, color: '#8A94A0', fontWeight: '600' },
});
