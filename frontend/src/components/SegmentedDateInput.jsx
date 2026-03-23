import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ── Segmented Date Input (DD / MM / YYYY) with auto‑jump and validation ── */
export default function SegmentedDateInput({ value, onChange }) {
  // value is "YYYY-MM-DD" or ""
  const dayRef = useRef(null);
  const monthRef = useRef(null);
  const yearRef = useRef(null);

  const parse = (v) => {
    if (!v) return { dd: '', mm: '', yyyy: '' };
    const [y, m, d] = v.split('-');
    return { dd: d || '', mm: m || '', yyyy: y || '' };
  };

  const [seg, setSeg] = useState(() => parse(value));

  useEffect(() => {
    setSeg(parse(value));
  }, [value]);

  const emit = useCallback((next) => {
    const { dd, mm, yyyy } = next;
    if (dd && mm && yyyy && dd.length === 2 && mm.length === 2 && yyyy.length === 4) {
      const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
      if (d.getFullYear() === parseInt(yyyy) && d.getMonth() === parseInt(mm) - 1 && d.getDate() === parseInt(dd)) {
        onChange(`${yyyy}-${mm}-${dd}`);
      }
    } else if (!dd && !mm && !yyyy) {
      onChange('');
    }
  }, [onChange]);

  const handleChange = (field, raw, maxLen, nextRef) => {
    let v = raw.replace(/\D/g, '').slice(0, maxLen);
    let shouldJump = v.length === maxLen;

    // Smart auto-jump
    if (field === 'dd' && v.length === 1 && parseInt(v) > 3) {
      v = '0' + v;
      shouldJump = true;
    }
    if (field === 'mm' && v.length === 1 && parseInt(v) > 1) {
      v = '0' + v;
      shouldJump = true;
    }

    // Bounds check
    if (v.length === 2) {
      let num = parseInt(v);
      if (field === 'dd' && num > 31) v = '31';
      else if (field === 'dd' && num === 0 && raw.length === 2) v = '01';
      else if (field === 'mm' && num > 12) v = '12';
      else if (field === 'mm' && num === 0 && raw.length === 2) v = '01';
    }

    const next = { ...seg, [field]: v };
    setSeg(next);
    emit(next);

    if (shouldJump && nextRef?.current) {
      nextRef.current.focus();
      nextRef.current.select();
    }
  };

  const handleKeyDown = (field, e, prevRef) => {
    if (e.key === 'Backspace' && seg[field] === '' && prevRef?.current) {
      prevRef.current.focus();
    }
  };

  const inputCls = 'bg-transparent text-center text-tg-text font-semibold outline-none';
  const separatorCls = 'text-tg-hint font-bold select-none';

  return (
    <div className="flex items-center gap-0 w-full px-3 py-2.5 rounded-xl bg-tg-bg focus-within:ring-2 focus-within:ring-tg-button border border-transparent min-h-[44px]">
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        placeholder="ДД"
        maxLength={2}
        value={seg.dd}
        onChange={(e) => handleChange('dd', e.target.value, 2, monthRef)}
        onKeyDown={(e) => handleKeyDown('dd', e, null)}
        onFocus={(e) => e.target.select()}
        className={`${inputCls} w-[28px]`}
      />
      <span className={separatorCls}>/</span>
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        placeholder="ММ"
        maxLength={2}
        value={seg.mm}
        onChange={(e) => handleChange('mm', e.target.value, 2, yearRef)}
        onKeyDown={(e) => handleKeyDown('mm', e, dayRef)}
        onFocus={(e) => e.target.select()}
        className={`${inputCls} w-[28px]`}
      />
      <span className={separatorCls}>/</span>
      <input
        ref={yearRef}
        type="text"
        inputMode="numeric"
        placeholder="ГГГГ"
        maxLength={4}
        value={seg.yyyy}
        onChange={(e) => handleChange('yyyy', e.target.value, 4, null)}
        onKeyDown={(e) => handleKeyDown('yyyy', e, monthRef)}
        onFocus={(e) => e.target.select()}
        className={`${inputCls} w-[44px]`}
      />
    </div>
  );
}
