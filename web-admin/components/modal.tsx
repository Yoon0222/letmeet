'use client';

import { useEffect } from 'react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** 넓은 폼용(코트 등록 등). 기본 max-w-2xl */
  wide?: boolean;
  /** 배경 클릭으로 닫기 허용. 기본 false — 입력 중 실수 닫힘 방지 */
  dismissable?: boolean;
  /** 헤더 우측(스텝 표시 등) */
  header?: React.ReactNode;
};

// 어드민 공용 모달. 등록/수정 폼을 팝업으로 띄운다.
export function Modal({ open, onClose, title, children, wide, dismissable = false, header }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={dismissable ? onClose : undefined}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`my-4 w-full sm:my-8 ${wide ? 'max-w-4xl' : 'max-w-2xl'} rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <div className="flex items-center gap-3">
            {header}
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
