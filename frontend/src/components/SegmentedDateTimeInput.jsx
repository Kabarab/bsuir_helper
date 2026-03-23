import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ── Segmented Date Time Input (DD/MM/YYYY HH:MM) with validation ── */
export default function SegmentedDateTimeInput({ value, onChange }) {
  // value is ISO string or ""
  const dayRef = useRef(null);
  const monthRef = useRef(null);
  const yearRef = useRef(null);
  const hourRef = useRef(null);
  const minRef = useRef(null);

  const parse = (v) => {
    if (!v) return { dd:'', mm:'', yyyy:'', hh:'', min:'' };
    try {
      const d = new Date(v);
      if (isNaN(d.getTime())) return { dd:'', mm:'', yyyy:'', hh:'', min:'' };
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = String(d.getFullYear());
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return { dd, mm, yyyy, hh, min };
    } catch { return { dd:'', mm:'', yyyy:'', hh:'', min:'' }; }
  };

  const [seg, setSeg] = useState(() => parse(value));
  useEffect(() => { setSeg(parse(value)); }, [value]);

  const emit = useCallback((next) => {
    if (dd && mm && yyyy && hh && min && dd.length===2 && mm.length===2 && yyyy.length===4 && hh.length===2 && min.length===2) {
      const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), parseInt(hh), parseInt(min));
      if (d.getFullYear() === parseInt(yyyy) && d.getMonth() === parseInt(mm) - 1 && d.getDate() === parseInt(dd)) {
        const iso = `${yyyy}-${mm}-${dd}T${hh}:${min}:00`;
        onChange(iso);
      }
    } else if (!dd && !mm && !yyyy && !hh && !min) {
      onChange('');
    }
  }, [onChange]);

  const handleChange = (field, raw, maxLen, nextRef) => {
    let v = raw.replace(/\D/g, '').slice(0, maxLen);
    let shouldJump = v.length === maxLen;

    // Smart auto-jump
    if (field === 'dd' && v.length === 1 && parseInt(v) > 3) { v = '0' + v; shouldJump = true; }
    if (field === 'mm' && v.length === 1 && parseInt(v) > 1) { v = '0' + v; shouldJump = true; }
    if (field === 'hh' && v.length === 1 && parseInt(v) > 2) { v = '0' + v; shouldJump = true; }

    // Bounds check
    if (v.length === 2) {
      let num = parseInt(v);
      if (field === 'dd' && num > 31) v = '31';
      else if (field === 'dd' && num === 0 && raw.length === 2) v = '01';
      else if (field === 'mm' && num > 12) v = '12';
      else if (field === 'mm' && num === 0 && raw.length === 2) v = '01';
      else if (field === 'hh' && num > 23) v = '23';
      else if (field === 'min' && num > 59) v = '59';
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

  const iCls = 'bg-transparent text-center text-tg-text font-bold outline-none text-[13px]';
  const sCls = 'text-tg-hint font-bold select-none opacity-40 text-[13px]';

  return (
    <div className="flex items-center gap-1 w-full px-3 py-2.5 rounded-xl bg-tg-secondaryBg border border-tg-hint/10 focus-within:ring-2 focus-within:ring-tg-button min-h-[44px]">
      <div className="flex items-center flex-1 justify-around">
        <input ref={dayRef} type="text" inputMode="numeric" placeholder="ДД" value={seg.dd} onChange={e=>handleChange('dd',e.target.value,2,monthRef)} onKeyDown={e=>handleKeyDown('dd',e,null)} onFocus={e=>e.target.select()} className={`${iCls} w-5`} />
        <span className={sCls}>/</span>
        <input ref={monthRef} type="text" inputMode="numeric" placeholder="ММ" value={seg.mm} onChange={e=>handleChange('mm',e.target.value,2,yearRef)} onKeyDown={e=>handleKeyDown('mm',e,dayRef)} onFocus={e=>e.target.select()} className={`${iCls} w-5`} />
        <span className={sCls}>/</span>
        <input ref={yearRef} type="text" inputMode="numeric" placeholder="ГГГГ" value={seg.yyyy} onChange={e=>handleChange('yyyy',e.target.value,4,hourRef)} onKeyDown={e=>handleKeyDown('yyyy',e,monthRef)} onFocus={e=>e.target.select()} className={`${iCls} w-9`} />
        <span className={sCls} style={{margin:'0 4px'}}>|</span>
        <input ref={hourRef} type="text" inputMode="numeric" placeholder="ЧЧ" value={seg.hh} onChange={e=>handleChange('hh',e.target.value,2,minRef)} onKeyDown={e=>handleKeyDown('hh',e,yearRef)} onFocus={e=>e.target.select()} className={`${iCls} w-5`} />
        <span className={sCls}>:</span>
        <input ref={minRef} type="text" inputMode="numeric" placeholder="ММ" value={seg.min} onChange={e=>handleChange('min',e.target.value,2,null)} onKeyDown={e=>handleKeyDown('min',e,hourRef)} onFocus={e=>e.target.select()} className={`${iCls} w-5`} />
      </div>
    </div>
  );
}
