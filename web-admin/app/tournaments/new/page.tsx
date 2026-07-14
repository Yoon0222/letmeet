'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Protected } from '@/components/protected';
import { supabase } from '@/lib/supabase';
import { TOURNAMENT_FORMAT_DESC, TOURNAMENT_FORMAT_LABELS, type TournamentFormat } from '@/lib/types';
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
  const [format, setFormat] = useState<TournamentFormat>('group_knockout');
  const [discipline, setDiscipline] = useState<'singles' | 'doubles'>('singles');
  // 단체전 설정
  const [teamMinSize, setTeamMinSize] = useState(2);
  const [tieSingles, setTieSingles] = useState(2);
  const [tieDoubles, setTieDoubles] = useState(1);
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

  // 코트 구성 (코트명 + 실내/실외). 대회마다 자유롭게.
  const [courts, setCourts] = useState<{ name: string; indoor: boolean }[]>([]);
  const [numCount, setNumCount] = useState(4);
  const [letterCount, setLetterCount] = useState(4);
  const [manualName, setManualName] = useState('');
  const [venueHint, setVenueHint] = useState<string | null>(null);

  // 같은 장소로 열린 지난 대회의 코트 구성을 자동으로 불러온다 (코트를 아직 안 짰을 때만)
  async function loadVenueCourts() {
    const v = venue.trim();
    if (!v || courts.length > 0) return;
    const { data: past } = await supabase
      .from('tournaments')
      .select('id')
      .eq('venue', v)
      .order('created_at', { ascending: false })
      .limit(10);
    if (!past?.length) return;
    const ids = past.map((p) => p.id);
    const { data: cs } = await supabase
      .from('tournament_courts')
      .select('tournament_id, name, indoor, sort')
      .in('tournament_id', ids)
      .order('sort', { ascending: true });
    if (!cs?.length) return;
    for (const tid of ids) {
      const group = cs.filter((c) => c.tournament_id === tid);
      if (group.length) {
        setCourts(group.map((c) => ({ name: c.name, indoor: c.indoor })));
        setVenueHint(`'${v}'의 지난 코트 구성 ${group.length}면을 불러왔어요. 필요하면 수정하세요.`);
        return;
      }
    }
  }

  function addCourts(names: string[]) {
    setCourts((prev) => {
      const seen = new Set(prev.map((c) => c.name));
      const add = names
        .map((n) => n.trim())
        .filter((n) => n && !seen.has(n))
        .map((n) => ({ name: n, indoor: true }));
      return [...prev, ...add];
    });
  }
  const addNumbered = () => addCourts(Array.from({ length: Math.max(0, Math.min(50, numCount)) }, (_, i) => String(i + 1)));
  const addLettered = () => addCourts(Array.from({ length: Math.max(0, Math.min(26, letterCount)) }, (_, i) => String.fromCharCode(65 + i)));
  const addManual = () => {
    if (manualName.trim()) {
      addCourts([manualName]);
      setManualName('');
    }
  };
  const toggleIndoor = (i: number) => setCourts((prev) => prev.map((c, idx) => (idx === i ? { ...c, indoor: !c.indoor } : c)));
  const removeCourt = (i: number) => setCourts((prev) => prev.filter((_, idx) => idx !== i));

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
        format,
        discipline,
        team_min_size: teamMinSize,
        tie_singles: tieSingles,
        tie_doubles: tieDoubles,
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
    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }
    // 코트 저장
    if (courts.length > 0) {
      const { error: courtErr } = await supabase.from('tournament_courts').insert(
        courts.map((c, i) => ({ tournament_id: data.id, name: c.name, indoor: c.indoor, sort: i })),
      );
      if (courtErr) {
        setSaving(false);
        setError(`대회는 생성됐지만 코트 저장에 실패했어요: ${courtErr.message}`);
        return;
      }
    }
    setSaving(false);
    router.replace(`/tournaments/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">새 대회 만들기</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="대회 제목">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 송파 오픈 복식" maxLength={50} />
        </Field>
        <Field label="진행 방식">
          <select className={inputCls} value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)}>
            {(Object.keys(TOURNAMENT_FORMAT_LABELS) as TournamentFormat[]).map((f) => (
              <option key={f} value={f}>
                {TOURNAMENT_FORMAT_LABELS[f]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">{TOURNAMENT_FORMAT_DESC[format]}</p>
        </Field>
        {format === 'team' ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="mb-2 block text-sm font-medium text-slate-700">단체전 설정</span>
            <div className="grid grid-cols-3 gap-4">
              <Field label="팀당 최소 인원">
                <input type="number" min={1} max={20} className={inputCls} value={teamMinSize} onChange={(e) => setTeamMinSize(Number(e.target.value))} />
              </Field>
              <Field label="타이당 단식 수">
                <input type="number" min={0} max={9} className={inputCls} value={tieSingles} onChange={(e) => setTieSingles(Number(e.target.value))} />
              </Field>
              <Field label="타이당 복식 수">
                <input type="number" min={0} max={9} className={inputCls} value={tieDoubles} onChange={(e) => setTieDoubles(Number(e.target.value))} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              팀 대 팀 한 판(타이)은 단식 {tieSingles}경기 + 복식 {tieDoubles}경기 = 총 {tieSingles + tieDoubles}경기로 겨루고, 더 많이 이긴 팀이 승리합니다.
            </p>
          </div>
        ) : (
          <Field label="종목">
            <select className={inputCls} value={discipline} onChange={(e) => setDiscipline(e.target.value as 'singles' | 'doubles')}>
              <option value="singles">단식</option>
              <option value="doubles">복식</option>
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="장소">
            <input
              className={inputCls}
              value={venue}
              onChange={(e) => {
                setVenue(e.target.value);
                if (venueHint) setVenueHint(null);
              }}
              onBlur={loadVenueCourts}
              placeholder="올림픽공원 피클볼장"
            />
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

        {/* 코트 구성 */}
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">코트 구성 (선택)</span>
          {venueHint && (
            <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-emerald-200">
              🏟 {venueHint}
            </p>
          )}
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <span className="mb-1 block text-xs text-slate-500">번호 코트</span>
                <div className="flex items-center gap-1">
                  <input type="number" min={1} max={50} value={numCount} onChange={(e) => setNumCount(Number(e.target.value))} className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  <button type="button" onClick={addNumbered} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
                    1~{Math.max(1, Math.min(50, numCount))}번 추가
                  </button>
                </div>
              </div>
              <div>
                <span className="mb-1 block text-xs text-slate-500">알파벳 코트</span>
                <div className="flex items-center gap-1">
                  <input type="number" min={1} max={26} value={letterCount} onChange={(e) => setLetterCount(Number(e.target.value))} className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                  <button type="button" onClick={addLettered} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
                    A~{String.fromCharCode(64 + Math.max(1, Math.min(26, letterCount)))} 추가
                  </button>
                </div>
              </div>
              <div>
                <span className="mb-1 block text-xs text-slate-500">직접 추가</span>
                <div className="flex items-center gap-1">
                  <input
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addManual();
                      }
                    }}
                    placeholder="센터코트"
                    className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                  <button type="button" onClick={addManual} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">
                    추가
                  </button>
                </div>
              </div>
            </div>

            {courts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {courts.map((c, i) => (
                  <span key={`${c.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white py-1 pl-3 pr-1.5 text-sm">
                    <span className="font-medium text-slate-800">{c.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleIndoor(i)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.indoor ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}
                      title="실내/실외 전환"
                    >
                      {c.indoor ? '실내' : '실외'}
                    </button>
                    <button type="button" onClick={() => removeCourt(i)} className="rounded-full px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      ✕
                    </button>
                  </span>
                ))}
                <button type="button" onClick={() => setCourts([])} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
                  전체 지우기
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400">코트를 추가하지 않으면 코트 정보 없이 생성돼요. 태그를 눌러 실내/실외를 바꿀 수 있어요.</p>
            )}
          </div>
        </div>

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
