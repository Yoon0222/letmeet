import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabase';

export type CourtLite = { id: string; name: string; region: string; address: string };
/** 장소 선택 결과 — courtId 있으면 등록 코트 연결, 없으면 자유입력 */
export type PlaceValue = { name: string; region: string; courtId: string | null };

// 번개 장소 선택: 등록 코트 검색 + (없으면) 자유입력. 타이핑=미등록, 결과 탭=등록 코트.
export function CourtPicker({ value, onChange }: { value: PlaceValue; onChange: (v: PlaceValue) => void }) {
  const [results, setResults] = useState<CourtLite[]>([]);
  const [open, setOpen] = useState(false);

  async function onType(text: string) {
    onChange({ name: text, region: value.region, courtId: null }); // 타이핑 = 자유입력(미등록)
    const q = text.trim();
    if (q.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    const { data } = await supabase
      .from('courts')
      .select('id, name, region, address')
      .ilike('name', `%${q}%`)
      .limit(6);
    setResults((data as CourtLite[]) ?? []);
    setOpen(true);
  }

  function pick(c: CourtLite) {
    onChange({ name: c.name, region: c.region, courtId: c.id });
    setResults([]);
    setOpen(false);
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>장소 (코트 검색)</Text>
      <View style={styles.inputRow}>
        <Ionicons name="search" size={16} color="#707B87" />
        <TextInput
          value={value.name}
          onChangeText={onType}
          placeholder="코트 이름 검색 · 또는 직접 입력"
          placeholderTextColor="#707B87"
          style={styles.input}
          onFocus={() => value.name.trim().length >= 1 && results.length > 0 && setOpen(true)}
        />
        {value.courtId ? <Ionicons name="checkmark-circle" size={18} color="#16C784" /> : null}
      </View>
      {value.courtId ? <Text style={styles.linkedHint}>등록 코트에 연결됨 · 지역 자동 입력</Text> : null}
      {open && results.length > 0 ? (
        <View style={styles.dropdown}>
          {results.map((c) => (
            <Pressable key={c.id} onPress={() => pick(c)} style={styles.row}>
              <Ionicons name="location" size={16} color="#16C784" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{c.name}</Text>
                <Text style={styles.rowSub} numberOfLines={1}>{c.region || c.address || '지역 미상'}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>등록 코트</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: '#AAB4C0' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: '#10161D',
  },
  input: { flex: 1, fontSize: 15, color: '#F8FAFC' },
  linkedHint: { fontSize: 12, color: '#16C784', fontWeight: '600' },
  dropdown: {
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: '#10161D',
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.09)' },
  rowName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  rowSub: { fontSize: 12, color: '#AAB4C0', marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(22,199,132,0.14)' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#16C784' },
});
