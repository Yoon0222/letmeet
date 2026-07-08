'use client';

import { useCallback, useEffect, useState } from 'react';

import { MonthCalendar } from '@/components/month-calendar';
import { Protected } from '@/components/protected';
import { AMENITIES, SURFACES, amenityLabel, surfaceLabel } from '@/lib/court-meta';
import { supabase } from '@/lib/supabase';
import type { Court, CourtUnit } from '@/lib/types';
import { useRole } from '@/lib/use-role';
import { useSession } from '@/lib/use-session';

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500';
const pad = (n: number) => String(n).padStart(2, '0');
const ymdToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};
// 오늘부터 n일 자동 오픈 윈도우
const autoOpenSet = (n: number) => {
  const t = ymdToday();
  const s = new Set<string>();
  for (let i = 0; i < n; i++) s.add(addDays(t, i));
  return s;
};
const AUTO_OPTIONS = [
  { v: 0, label: '자동 오픈 안 함 (수동 지정)' },
  { v: 7, label: '1주 (7일)' },
  { v: 14, label: '2주 (14일)' },
  { v: 30, label: '1개월 (30일)' },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

type Manager = { id: string; nickname: string };

type Form = {
  name: string;
  region: string;
  address: string;
  indoor: boolean;
  hourly_price: number;
  open_hour: number;
  close_hour: number;
  description: string;
  latitude: number | null;
  longitude: number | null;
  owner_id: string | null;
  court_units: CourtUnit[];
  amenities: string[];
  lessons: boolean;
  auto_open_days: number;
};

const EMPTY: Form = {
  name: '',
  region: '',
  address: '',
  indoor: true,
  hourly_price: 0,
  open_hour: 6,
  close_hour: 22,
  description: '',
  latitude: null,
  longitude: null,
  owner_id: null,
  court_units: [],
  amenities: [],
  lessons: false,
  auto_open_days: 0,
};

function CourtsInner() {
  const { role } = useRole();
  const { session } = useSession();
  const myId = session?.user.id ?? null;
  const isSuper = role === 'super_admin';
  const isManager = role === 'court_manager';

  const [rows, setRows] = useState<Court[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null); // null = 새 코트
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [unitCount, setUnitCount] = useState(4);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set()); // 편집 중 코트의 오픈일

  const load = useCallback(async () => {
    setLoading(true);
    let req = supabase.from('courts').select('*').order('region', { ascending: true }).order('name', { ascending: true });
    // 코트관리자는 자기 코트만
    if (isManager && myId) req = supabase.from('courts').select('*').eq('owner_id', myId).order('name', { ascending: true });
    const { data } = await req;
    setRows(data ?? []);
    setLoading(false);
  }, [isManager, myId]);

  const loadManagers = useCallback(async () => {
    if (!isSuper) return;
    const { data } = await supabase.from('profiles').select('id, nickname').eq('role', 'court_manager').order('nickname', { ascending: true });
    setManagers((data as Manager[]) ?? []);
  }, [isSuper]);

  useEffect(() => {
    if (role == null) return;
    const t = setTimeout(() => {
      load();
      loadManagers();
    }, 0);
    return () => clearTimeout(t);
  }, [role, load, loadManagers]);

  const ownerName = (id: string | null) => (id ? managers.find((m) => m.id === id)?.nickname ?? (id === myId ? '나' : '지정됨') : '미지정');

  function startNew() {
    setEditingId(null);
    setForm(EMPTY);
    setError('');
    setGeoStatus(null);
    setOpenDays(new Set());
  }

  async function loadOpenDays(courtId: string) {
    const { data } = await supabase.from('court_open_days').select('day').eq('court_id', courtId);
    setOpenDays(new Set((data ?? []).map((r) => r.day)));
  }

  // 예약 가능일 열기/닫기 (즉시 저장)
  async function toggleOpenDay(day: string) {
    if (!editingId) return;
    const isOpen = openDays.has(day);
    // 낙관적 업데이트
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(day);
      else next.add(day);
      return next;
    });
    const { error: err } = isOpen
      ? await supabase.from('court_open_days').delete().eq('court_id', editingId).eq('day', day)
      : await supabase.from('court_open_days').insert({ court_id: editingId, day });
    if (err) {
      alert('예약 가능일 저장 실패: ' + err.message);
      loadOpenDays(editingId); // 롤백
    }
  }

  function startEdit(c: Court) {
    setEditingId(c.id);
    loadOpenDays(c.id);
    setForm({
      name: c.name,
      region: c.region,
      address: c.address,
      indoor: c.indoor,
      hourly_price: c.hourly_price,
      open_hour: c.open_hour,
      close_hour: c.close_hour,
      description: c.description,
      latitude: c.latitude,
      longitude: c.longitude,
      owner_id: c.owner_id,
      court_units: Array.isArray(c.court_units) ? c.court_units : [],
      amenities: Array.isArray(c.amenities) ? c.amenities : [],
      lessons: !!c.lessons,
      auto_open_days: c.auto_open_days ?? 0,
    });
    setError('');
    setGeoStatus(c.latitude != null ? { ok: true, msg: '저장된 좌표가 있어요.' } : null);
  }

  // 주소 → 좌표(네이버 지오코딩 프록시)
  async function geocode() {
    const addr = form.address.trim();
    if (!addr) {
      setGeoStatus({ ok: false, msg: '먼저 주소를 입력하세요.' });
      return;
    }
    setGeoLoading(true);
    setGeoStatus(null);
    try {
      const res = await fetch(`/api/geocode?query=${encodeURIComponent(addr)}`);
      const data = await res.json();
      if (!res.ok) {
        setGeoStatus({ ok: false, msg: data.error ?? '좌표 변환에 실패했어요.' });
      } else {
        setForm((f) => ({ ...f, latitude: data.lat, longitude: data.lng }));
        setGeoStatus({ ok: true, msg: `변환됨: ${data.roadAddress || data.jibunAddress || addr}` });
      }
    } catch {
      setGeoStatus({ ok: false, msg: '좌표 변환 요청에 실패했어요.' });
    }
    setGeoLoading(false);
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // 면(코트) 편집
  const genUnits = () => {
    const n = Math.max(1, Math.min(50, unitCount));
    set('court_units', Array.from({ length: n }, (_, i) => ({ name: String(i + 1), surface: 'hard' })));
  };
  const addUnit = () => setForm((f) => ({ ...f, court_units: [...f.court_units, { name: String(f.court_units.length + 1), surface: 'hard' }] }));
  const setUnit = (i: number, patch: Partial<CourtUnit>) =>
    setForm((f) => ({ ...f, court_units: f.court_units.map((u, idx) => (idx === i ? { ...u, ...patch } : u)) }));
  const removeUnit = (i: number) => setForm((f) => ({ ...f, court_units: f.court_units.filter((_, idx) => idx !== i) }));
  const toggleAmenity = (key: string) =>
    setForm((f) => ({ ...f, amenities: f.amenities.includes(key) ? f.amenities.filter((a) => a !== key) : [...f.amenities, key] }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!editingId && !isSuper) {
      setError('신규 코트 등록은 최고관리자만 가능합니다.');
      return;
    }
    if (!form.name.trim()) {
      setError('코트 이름은 필수입니다.');
      return;
    }
    if (form.open_hour >= form.close_hour) {
      setError('운영 시작 시각이 종료 시각보다 빨라야 합니다.');
      return;
    }
    setSaving(true);
    const base = {
      name: form.name.trim(),
      region: form.region.trim(),
      address: form.address.trim(),
      indoor: form.indoor,
      hourly_price: form.hourly_price,
      open_hour: form.open_hour,
      close_hour: form.close_hour,
      description: form.description.trim(),
      latitude: form.latitude,
      longitude: form.longitude,
      court_units: form.court_units,
      amenities: form.amenities,
      lessons: form.lessons,
      auto_open_days: form.auto_open_days,
    };
    // owner_id 는 최고관리자만 지정/변경(코트관리자는 자기 코트 소유권 못 바꿈)
    const payload = isSuper ? { ...base, owner_id: form.owner_id } : base;
    const { error: err } = editingId
      ? await supabase.from('courts').update(payload).eq('id', editingId)
      : await supabase.from('courts').insert(payload);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    startNew();
    load();
  }

  async function onDelete(c: Court) {
    if (!confirm(`'${c.name}' 코트를 삭제할까요?\n이 코트의 모든 예약도 함께 삭제됩니다.`)) return;
    const { error: err } = await supabase.from('courts').delete().eq('id', c.id);
    if (err) {
      alert('삭제 실패: ' + err.message);
      return;
    }
    if (editingId === c.id) startNew();
    load();
  }

  // 권한: 최고관리자 또는 코트관리자만
  if (role != null && !isSuper && !isManager) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <h1 className="text-xl font-semibold">접근 권한이 없어요</h1>
        <p className="mt-2 text-sm text-slate-500">코트 관리는 최고관리자 또는 코트관리자만 가능합니다.</p>
      </div>
    );
  }

  const showForm = isSuper || editingId != null; // 코트관리자는 자기 코트 수정 시에만 폼 노출

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">코트 관리</h1>
      <p className="mt-1 text-sm text-slate-500">
        {isSuper ? '선수 앱 코트 예약에 노출되는 시설을 등록·수정하고, 코트관리자를 지정합니다.' : '내가 담당하는 코트의 정보를 수정합니다.'}
      </p>

      {/* 등록/수정 폼 */}
      {showForm ? (
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-slate-800">{editingId ? '코트 수정' : '새 코트 등록'}</h2>
            {editingId && (
              <button type="button" onClick={startNew} className="text-sm text-slate-500 hover:text-slate-800 hover:underline">
                {isSuper ? '+ 새 코트 등록으로' : '수정 취소'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="코트 이름">
              <input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="한강 피클볼 센터" maxLength={50} />
            </Field>
            <Field label="지역">
              <input className={inputCls} value={form.region} onChange={(e) => set('region', e.target.value)} placeholder="서울 용산" />
            </Field>
          </div>
          <Field label="주소">
            <input className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="용산구 이촌로 100" />
          </Field>

          {/* 위치(좌표) */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">지도 위치 (좌표)</span>
              <button
                type="button"
                onClick={geocode}
                disabled={geoLoading}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
              >
                {geoLoading ? '변환 중…' : '주소로 좌표 찾기'}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">위도 (latitude)</span>
                <input type="number" step="any" className={inputCls} value={form.latitude ?? ''} onChange={(e) => set('latitude', e.target.value === '' ? null : Number(e.target.value))} placeholder="37.5326" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">경도 (longitude)</span>
                <input type="number" step="any" className={inputCls} value={form.longitude ?? ''} onChange={(e) => set('longitude', e.target.value === '' ? null : Number(e.target.value))} placeholder="126.9906" />
              </label>
            </div>
            {geoStatus && <p className={`mt-2 text-xs ${geoStatus.ok ? 'text-emerald-700' : 'text-red-600'}`}>{geoStatus.ok ? '📍 ' : '⚠ '}{geoStatus.msg}</p>}
          </div>

          <div className="grid grid-cols-4 gap-4">
            <Field label="실내/실외">
              <select className={inputCls} value={form.indoor ? 'in' : 'out'} onChange={(e) => set('indoor', e.target.value === 'in')}>
                <option value="in">실내</option>
                <option value="out">실외</option>
              </select>
            </Field>
            <Field label="시간당 요금 (원)">
              <input type="number" min={0} step={1000} className={inputCls} value={form.hourly_price} onChange={(e) => set('hourly_price', Number(e.target.value))} />
            </Field>
            <Field label="운영 시작 (시)">
              <input type="number" min={0} max={23} className={inputCls} value={form.open_hour} onChange={(e) => set('open_hour', Number(e.target.value))} />
            </Field>
            <Field label="운영 종료 (시)">
              <input type="number" min={1} max={24} className={inputCls} value={form.close_hour} onChange={(e) => set('close_hour', Number(e.target.value))} />
            </Field>
          </div>

          {/* 코트관리자 지정 — 최고관리자만 */}
          {isSuper && (
            <Field label="담당 코트관리자">
              <select className={inputCls} value={form.owner_id ?? ''} onChange={(e) => set('owner_id', e.target.value || null)}>
                <option value="">미지정</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nickname}
                  </option>
                ))}
              </select>
              {managers.length === 0 && <span className="mt-1 block text-xs text-slate-400">코트관리자 역할 사용자가 없어요. 사용자 관리에서 역할을 부여하세요.</span>}
            </Field>
          )}

          {/* 면(코트) 구성 — 면별 바닥 */}
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">면(코트) 구성 · 바닥</span>
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">번호로 생성</span>
                <input type="number" min={1} max={50} value={unitCount} onChange={(e) => setUnitCount(Number(e.target.value))} className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <button type="button" onClick={genUnits} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
                  1~{Math.max(1, Math.min(50, unitCount))}번 생성
                </button>
                <button type="button" onClick={addUnit} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
                  + 면 추가
                </button>
              </div>
              {form.court_units.length > 0 ? (
                <div className="space-y-2">
                  {form.court_units.map((u, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={u.name}
                        onChange={(e) => setUnit(i, { name: e.target.value })}
                        placeholder={`${i + 1}`}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <span className="text-xs text-slate-400">번 코트 바닥</span>
                      <select value={u.surface} onChange={(e) => setUnit(i, { surface: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                        {SURFACES.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeUnit(i)} className="rounded-full px-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">면을 추가하지 않으면 면 정보 없이 저장돼요. 면마다 바닥을 다르게 지정할 수 있어요.</p>
              )}
            </div>
          </div>

          {/* 편의시설 */}
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">편의시설</span>
            <div className="flex flex-wrap gap-2">
              {AMENITIES.map((a) => {
                const on = form.amenities.includes(a.key);
                return (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => toggleAmenity(a.key)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${on ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {a.emoji} {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 레슨 */}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.lessons} onChange={(e) => set('lessons', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
            <span className="text-sm font-medium text-slate-700">레슨 가능</span>
          </label>

          {/* 예약 가능일 — 자동 오픈(롤링) + 수동 추가일 */}
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">예약 자동 오픈</span>
            <select className={inputCls} value={form.auto_open_days} onChange={(e) => set('auto_open_days', Number(e.target.value))}>
              {AUTO_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">오늘부터 선택한 기간이 항상 자동으로 예약 오픈돼요(날짜가 지나면 다음날 자동 오픈). 저장해야 적용됩니다.</p>

            <span className="mb-1 mt-4 block text-sm font-medium text-slate-700">추가 예약일 (자동 오픈 외 특정일) · 수동 {openDays.size}일</span>
            {editingId ? (
              <MonthCalendar activeDays={openDays} onToggle={toggleOpenDay} todayYmd={ymdToday()} autoDays={autoOpenSet(form.auto_open_days)} />
            ) : (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                코트를 먼저 등록·저장한 뒤, 수정 화면에서 특정일을 추가로 열 수 있어요.
              </p>
            )}
          </div>

          <Field label="소개 (선택)">
            <textarea className={`${inputCls} min-h-20`} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="시설 소개, 이용 안내 등" maxLength={300} />
          </Field>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? '저장 중…' : editingId ? '수정 저장' : '코트 등록'}
            </button>
            {editingId && (
              <button type="button" onClick={startNew} className="rounded-lg border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-100">
                취소
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          수정할 코트를 아래 목록에서 선택하세요.
        </p>
      )}

      {/* 목록 */}
      {loading ? (
        <p className="mt-8 text-slate-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">{isManager ? '담당 코트가 없어요. 최고관리자에게 코트 배정을 요청하세요.' : '등록된 코트가 없습니다. 위에서 첫 코트를 등록하세요.'}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">이름</th>
                <th className="px-4 py-2 font-medium">지역</th>
                <th className="px-4 py-2 font-medium">구성</th>
                <th className="px-4 py-2 font-medium">편의·레슨</th>
                <th className="px-4 py-2 font-medium">운영시간</th>
                <th className="px-4 py-2 font-medium">요금</th>
                {isSuper && <th className="px-4 py-2 font-medium">담당</th>}
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const units = Array.isArray(c.court_units) ? c.court_units : [];
                const surfaces = [...new Set(units.map((u) => surfaceLabel(u.surface)))];
                const ams = Array.isArray(c.amenities) ? c.amenities : [];
                return (
                  <tr key={c.id} className={`border-t border-slate-100 ${editingId === c.id ? 'bg-emerald-50/50' : ''}`}>
                    <td className="px-4 py-2 font-medium text-slate-800">
                      {c.latitude != null ? '📍 ' : ''}
                      {c.name}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{c.region || '-'}</td>
                    <td className="px-4 py-2 text-slate-600">
                      <span className={`mr-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.indoor ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>{c.indoor ? '실내' : '실외'}</span>
                      {units.length > 0 ? `${units.length}면${surfaces.length ? ` · ${surfaces.join(',')}` : ''}` : '면 미설정'}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {ams.length > 0 ? <span title={ams.map(amenityLabel).join(', ')}>{ams.map((a) => AMENITIES.find((x) => x.key === a)?.emoji ?? '').join(' ')}</span> : <span className="text-slate-300">-</span>}
                      {c.lessons && <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">레슨</span>}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{c.open_hour}–{c.close_hour}시</td>
                    <td className="px-4 py-2 text-slate-700">{c.hourly_price > 0 ? `${c.hourly_price.toLocaleString()}원` : '무료'}</td>
                    {isSuper && <td className="px-4 py-2 text-slate-500">{ownerName(c.owner_id)}</td>}
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(c)} className="mr-3 text-slate-500 hover:text-emerald-700 hover:underline">
                        수정
                      </button>
                      {isSuper && (
                        <button onClick={() => onDelete(c)} className="text-slate-400 hover:text-red-600 hover:underline">
                          삭제
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CourtsPage() {
  return (
    <Protected>
      <CourtsInner />
    </Protected>
  );
}
