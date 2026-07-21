'use client';

import { useCallback, useEffect, useState } from 'react';

import { Protected } from '@/components/protected';
import { supabase } from '@/lib/supabase';
import type { EventPopup } from '@/lib/types';
import { useRole } from '@/lib/use-role';
import { useSession } from '@/lib/use-session';

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500';

// timestamptz <-> datetime-local 변환
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** 지금 이 팝업이 앱에 뜨는 상태인지 */
function statusOf(p: EventPopup): { label: string; cls: string } {
  if (!p.active) return { label: '내림', cls: 'bg-slate-100 text-slate-500' };
  const now = Date.now();
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return { label: '예정', cls: 'bg-sky-100 text-sky-700' };
  if (p.ends_at && new Date(p.ends_at).getTime() < now) return { label: '종료', cls: 'bg-slate-100 text-slate-500' };
  return { label: '노출중', cls: 'bg-emerald-100 text-emerald-700' };
}

type Form = { title: string; body: string; active: boolean; starts: string; ends: string; imageUrl: string | null };
const EMPTY: Form = { title: '', body: '', active: false, starts: '', ends: '', imageUrl: null };

function EventsInner() {
  const { role } = useRole();
  const { session } = useSession();
  const isSuper = role === 'super_admin';

  const [rows, setRows] = useState<EventPopup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // 배너 이미지 업로드 (Storage event-images)
  async function uploadImage(file: File) {
    setUploading(true);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage.from('event-images').upload(path, file, { upsert: false });
    if (upErr) {
      setUploading(false);
      alert('이미지 업로드 실패: ' + upErr.message);
      return;
    }
    setForm((f) => ({ ...f, imageUrl: supabase.storage.from('event-images').getPublicUrl(path).data.publicUrl }));
    setUploading(false);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('event_popups').select('*').order('created_at', { ascending: false }).limit(100);
    setRows((data as EventPopup[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function startNew() {
    setEditingId(null);
    setForm(EMPTY);
    setError('');
  }
  function startEdit(p: EventPopup) {
    setEditingId(p.id);
    setForm({ title: p.title, body: p.body, active: p.active, starts: toLocalInput(p.starts_at), ends: toLocalInput(p.ends_at), imageUrl: p.image_url });
    setError('');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) {
      setError('제목은 필수입니다.');
      return;
    }
    const starts = toIso(form.starts);
    const ends = toIso(form.ends);
    if (starts && ends && new Date(starts) >= new Date(ends)) {
      setError('시작이 종료보다 빨라야 합니다.');
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      active: form.active,
      starts_at: starts,
      ends_at: ends,
      image_url: form.imageUrl,
      updated_at: new Date().toISOString(),
    };
    const { error: err } = editingId
      ? await supabase.from('event_popups').update(payload).eq('id', editingId)
      : await supabase.from('event_popups').insert({ ...payload, created_by: session?.user.id ?? null });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    startNew();
    load();
  }

  // 올리기/내리기
  async function toggleActive(p: EventPopup) {
    const { error: err } = await supabase
      .from('event_popups')
      .update({ active: !p.active, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    if (err) {
      alert('변경 실패: ' + err.message);
      return;
    }
    load();
  }

  async function onDelete(p: EventPopup) {
    if (!confirm(`'${p.title}' 팝업을 삭제할까요?`)) return;
    const { error: err } = await supabase.from('event_popups').delete().eq('id', p.id);
    if (err) {
      alert('삭제 실패: ' + err.message);
      return;
    }
    if (editingId === p.id) startNew();
    load();
  }

  if (role != null && !isSuper) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <h1 className="text-xl font-semibold">접근 권한이 없어요</h1>
        <p className="mt-2 text-sm text-slate-500">이벤트 팝업 관리는 최고관리자만 가능합니다.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">이벤트 팝업</h1>
      <p className="mt-1 text-sm text-slate-500">앱 홈 진입 시 뜨는 팝업을 등록하고, 올리기·내리기와 노출 기간을 설정합니다.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-slate-800">{editingId ? '팝업 수정' : '새 팝업'}</h2>
          {editingId && (
            <button type="button" onClick={startNew} className="text-sm text-slate-500 hover:text-slate-800 hover:underline">
              + 새 팝업으로
            </button>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">제목</span>
          <input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="예: 피넛 정식 오픈 준비중" maxLength={60} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">내용</span>
          <textarea className={`${inputCls} min-h-24`} value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="팝업에 표시할 안내 문구" maxLength={300} />
        </label>

        {/* 배너 이미지 (선택) */}
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">배너 이미지 (선택)</span>
          {form.imageUrl ? (
            <div className="relative w-full max-w-sm overflow-hidden rounded-xl border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.imageUrl} alt="배너" className="aspect-video w-full object-cover" />
              <button
                type="button"
                onClick={() => set('imageUrl', null)}
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-sm text-white hover:bg-black/70"
              >
                ✕
              </button>
            </div>
          ) : (
            <label className="flex aspect-video w-full max-w-sm cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 text-sm text-slate-500 hover:bg-slate-50">
              {uploading ? '업로드 중…' : '+ 배너 이미지 추가'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
            </label>
          )}
          <p className="mt-1 text-xs text-slate-400">팝업 상단에 표시돼요. 가로형(16:9) 권장.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">노출 시작 (선택)</span>
            <input type="datetime-local" className={inputCls} value={form.starts} onChange={(e) => set('starts', e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">노출 종료 (선택)</span>
            <input type="datetime-local" className={inputCls} value={form.ends} onChange={(e) => set('ends', e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-slate-400">비워두면 제한 없음. 시작만 지정하면 그때부터, 종료만 지정하면 그때까지 노출돼요.</p>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
          <span className="text-sm font-medium text-slate-700">지금 올리기 (앱에 노출)</span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? '저장 중…' : editingId ? '수정 저장' : '팝업 등록'}
          </button>
          {editingId && (
            <button type="button" onClick={startNew} className="rounded-lg border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-100">
              취소
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="mt-8 text-slate-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">등록된 팝업이 없어요. 위에서 첫 팝업을 만들어보세요.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((p) => {
            const st = statusOf(p);
            return (
              <div key={p.id} className={`rounded-xl border bg-white p-4 ${editingId === p.id ? 'border-emerald-400' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image_url} alt="" className="h-16 w-28 shrink-0 rounded-lg border border-slate-200 object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{p.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </div>
                    {p.body ? <p className="mt-1 text-sm text-slate-600">{p.body}</p> : null}
                    <p className="mt-1 text-xs text-slate-400">
                      {p.starts_at ? new Date(p.starts_at).toLocaleString('ko-KR') : '시작 제한 없음'} ~{' '}
                      {p.ends_at ? new Date(p.ends_at).toLocaleString('ko-KR') : '종료 없음'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${p.active ? 'border border-slate-300 text-slate-600 hover:bg-slate-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                    >
                      {p.active ? '내리기' : '올리기'}
                    </button>
                    <button onClick={() => startEdit(p)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                      수정
                    </button>
                    <button onClick={() => onDelete(p)} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-red-600">
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400">
        &lsquo;노출중&rsquo;인 팝업은 <b>모두</b> 앱에 표시됩니다 — 최근에 만든 것부터 하나씩 순서대로 넘어가요(1/2 표시). 사용자가 &lsquo;오늘 하루 보지 않기&rsquo;를 누르면 <b>그 팝업만</b> 그날 다시 뜨지 않아요.
      </p>
    </div>
  );
}

export default function EventsPage() {
  return (
    <Protected>
      <EventsInner />
    </Protected>
  );
}
