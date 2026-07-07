'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Protected } from '@/components/protected';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';

function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500';

function NewTournamentInner() {
  const router = useRouter();
  const { session } = useSession();

  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState<'singles' | 'doubles'>('singles');
  const [venue, setVenue] = useState('');
  const [region, setRegion] = useState('');
  const [startAt, setStartAt] = useState('');
  const [deadline, setDeadline] = useState('');
  const [maxP, setMaxP] = useState(16);
  const [skillMin, setSkillMin] = useState(2.0);
  const [skillMax, setSkillMax] = useState(8.0);
  const [fee, setFee] = useState(0);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const uid = session?.user.id;
    if (!uid) return;
    const iso = toIso(startAt);
    if (!title.trim() || !iso) {
      setError('제목과 대회 시작 일시는 필수입니다.');
      return;
    }
    if (skillMin > skillMax) {
      setError('최소 실력이 최대 실력보다 클 수 없습니다.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        organizer_id: uid,
        title: title.trim(),
        discipline,
        venue: venue.trim(),
        region: region.trim(),
        start_at: iso,
        registration_deadline: toIso(deadline),
        max_participants: maxP,
        skill_min: skillMin,
        skill_max: skillMax,
        fee,
        description: description.trim(),
      })
      .select('id')
      .single();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace(`/tournaments/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">새 대회 만들기</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="대회 제목">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 송파 오픈 복식" maxLength={50} />
        </Field>
        <Field label="종목">
          <select className={inputCls} value={discipline} onChange={(e) => setDiscipline(e.target.value as 'singles' | 'doubles')}>
            <option value="singles">단식</option>
            <option value="doubles">복식</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="장소">
            <input className={inputCls} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="올림픽공원 피클볼장" />
          </Field>
          <Field label="지역">
            <input className={inputCls} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="서울 송파구" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="대회 시작 일시">
            <input type="datetime-local" className={inputCls} value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </Field>
          <Field label="접수 마감 (선택)">
            <input type="datetime-local" className={inputCls} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Field label={discipline === 'doubles' ? '정원 (팀 수)' : '정원 (인원)'}>
            <input type="number" min={2} max={256} className={inputCls} value={maxP} onChange={(e) => setMaxP(Number(e.target.value))} />
          </Field>
          <Field label="최소 실력">
            <input type="number" step={0.5} min={2} max={8} className={inputCls} value={skillMin} onChange={(e) => setSkillMin(Number(e.target.value))} />
          </Field>
          <Field label="최대 실력">
            <input type="number" step={0.5} min={2} max={8} className={inputCls} value={skillMax} onChange={(e) => setSkillMax(Number(e.target.value))} />
          </Field>
          <Field label="참가비 (원)">
            <input type="number" min={0} step={1000} className={inputCls} value={fee} onChange={(e) => setFee(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="소개 (선택)">
          <textarea className={`${inputCls} min-h-24`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="대회 방식, 상품, 준비물 등" maxLength={500} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? '만드는 중…' : '대회 만들기'}
          </button>
          <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-100">
            취소
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewTournamentPage() {
  return (
    <Protected>
      <NewTournamentInner />
    </Protected>
  );
}
