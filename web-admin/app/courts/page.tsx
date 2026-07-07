'use client';

import { useCallback, useEffect, useState } from 'react';

import { Protected } from '@/components/protected';
import { supabase } from '@/lib/supabase';
import type { Court } from '@/lib/types';

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

type Form = {
  name: string;
  region: string;
  address: string;
  indoor: boolean;
  hourly_price: number;
  open_hour: number;
  close_hour: number;
  description: string;
};

const EMPTY: Form = { name: '', region: '', address: '', indoor: true, hourly_price: 0, open_hour: 6, close_hour: 22, description: '' };

function CourtsInner() {
  const [rows, setRows] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null); // null = 새 코트
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('courts').select('*').order('region', { ascending: true }).order('name', { ascending: true });
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId(null);
    setForm(EMPTY);
    setError('');
  }

  function startEdit(c: Court) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      region: c.region,
      address: c.address,
      indoor: c.indoor,
      hourly_price: c.hourly_price,
      open_hour: c.open_hour,
      close_hour: c.close_hour,
      description: c.description,
    });
    setError('');
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('코트 이름은 필수입니다.');
      return;
    }
    if (form.open_hour >= form.close_hour) {
      setError('운영 시작 시각이 종료 시각보다 빨라야 합니다.');
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      region: form.region.trim(),
      address: form.address.trim(),
      indoor: form.indoor,
      hourly_price: form.hourly_price,
      open_hour: form.open_hour,
      close_hour: form.close_hour,
      description: form.description.trim(),
    };
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

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">코트 관리</h1>
      <p className="mt-1 text-sm text-slate-500">선수 앱의 코트 예약에 노출되는 시설을 등록·수정합니다.</p>

      {/* 등록/수정 폼 */}
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-800">{editingId ? '코트 수정' : '새 코트 등록'}</h2>
          {editingId && (
            <button type="button" onClick={startNew} className="text-sm text-slate-500 hover:text-slate-800 hover:underline">
              + 새 코트 등록으로
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
        <Field label="소개 (선택)">
          <textarea className={`${inputCls} min-h-20`} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="면 수, 샤워실·주차, 라켓 대여 등" maxLength={300} />
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

      {/* 목록 */}
      {loading ? (
        <p className="mt-8 text-slate-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">등록된 코트가 없습니다. 위에서 첫 코트를 등록하세요.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">이름</th>
                <th className="px-4 py-2 font-medium">지역</th>
                <th className="px-4 py-2 font-medium">유형</th>
                <th className="px-4 py-2 font-medium">운영시간</th>
                <th className="px-4 py-2 font-medium">요금</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={`border-t border-slate-100 ${editingId === c.id ? 'bg-emerald-50/50' : ''}`}>
                  <td className="px-4 py-2 font-medium text-slate-800">{c.name}</td>
                  <td className="px-4 py-2 text-slate-500">{c.region || '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.indoor ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                      {c.indoor ? '실내' : '실외'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{c.open_hour}–{c.close_hour}시</td>
                  <td className="px-4 py-2 text-slate-700">{c.hourly_price > 0 ? `${c.hourly_price.toLocaleString()}원` : '무료'}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => startEdit(c)} className="mr-3 text-slate-500 hover:text-emerald-700 hover:underline">
                      수정
                    </button>
                    <button onClick={() => onDelete(c)} className="text-slate-400 hover:text-red-600 hover:underline">
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CourtsPage() {
  return (
    <Protected superAdmin>
      <CourtsInner />
    </Protected>
  );
}
