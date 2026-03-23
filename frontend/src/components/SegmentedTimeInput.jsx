import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';

/* ── Segmented Time Input (HH:MM) ── */
const SegmentedTimeInput = forwardRef(({ value, onChange, onComplete }, ref) => {
  const hhRef = useRef(null);
  const minRef = useRef(null);

  const parse = (v) => {
    if (!v) return { hh: '', min: '' };
    const [h, m] = v.split(':');
    return { hh: h || '', min: m || '' };
  };

  useImperativeHandle(ref, () => ({
    focus: () => {
      hhRef.current?.focus();
      hhRef.current?.select();
    }
  }));

  const [seg, setSeg] = useState(() => parse(value));
  useEffect(() => { setSeg(parse(value)); }, [value]);

  const emit = useCallback((next) => {
    const { hh, min } = next;
    if (hh && min && hh.length === 2 && min.length === 2) {
      onChange(`${hh}:${min}`);
    } else if (!hh && !min) {
      onChange('');
    }
  }, [onChange]);

  const handleChange = (field, raw, maxLen, nextRef) => {
    let v = raw.replace(/\D/g, '').slice(0, maxLen);
    let shouldJump = v.length === maxLen || (raw.length > 0 && /[:\/\-\.\s]/.test(raw.slice(-1)));

    if (field === 'hh' && v.length === 1 && parseInt(v) > 2) {
      v = '0' + v;
      shouldJump = true;
    }

    if (v.length === 2) {
      let num = parseInt(v);
      if (field === 'hh' && num > 23) v = '23';
      else if (field === 'min' && num > 59) v = '59';
    }

    const next = { ...seg, [field]: v };
    setSeg(next);
    emit(next);

    if (shouldJump) {
      if (nextRef?.current) {
        nextRef.current.focus();
        nextRef.current.select();
      } else if (field === 'min' && onComplete) {
        onComplete();
      }
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
    <div className="flex items-center gap-1 w-full px-3 py-2.5 rounded-xl bg-tg-secondaryBg border border-tg-hint/10 focus-within:ring-2 focus-within:ring-tg-button min-h-[44px] transition-all">
      <div className="flex items-center flex-1 justify-around">
        <input
          ref={hhRef}
          type="text"
          inputMode="numeric"
          placeholder="ЧЧ"
          maxLength={2}
          value={seg.hh}
          onChange={(e) => handleChange('hh', e.target.value, 2, minRef)}
          onKeyDown={(e) => handleKeyDown('hh', e, null)}
          onFocus={(e) => e.target.select()}
          className={`${iCls} w-5`}
        />
        <span className={sCls}>:</span>
        <input
          ref={minRef}
          type="text"
          inputMode="numeric"
          placeholder="ММ"
          maxLength={2}
          value={seg.min}
          onChange={(e) => handleChange('min', e.target.value, 2, null)}
          onKeyDown={(e) => handleKeyDown('min', e, hhRef)}
          onFocus={(e) => e.target.select()}
          className={`${iCls} w-5`}
        />
      </div>
    </div>
  );
});

export default SegmentedTimeInput;
