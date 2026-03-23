import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * SegmentedTimeInput (HH:MM) with auto-jump and validation.
 * @param {string} value - "HH:MM" or ""
 * @param {function} onChange - callback with "HH:MM"
 */
function SegmentedTimeInput({ value, onChange }) {
  const hourRef = useRef(null);
  const minRef = useRef(null);

  const parse = (v) => {
    if (!v) return { hh: '', min: '' };
    const [h, m] = v.split(':');
    return { hh: h || '', min: m || '' };
  };

  const [seg, setSeg] = useState(() => parse(value));

  useEffect(() => {
    setSeg(parse(value));
  }, [value]);

  const emit = useCallback((next) => {
    if (hh && min && hh.length === 2 && min.length === 2) {
      onChange(`${hh}:${min}`);
    } else if (!hh && !min) {
      onChange('');
    }
  }, [onChange]);

  const handleChange = (field, raw, maxLen, nextRef) => {
    let v = raw.replace(/\D/g, '').slice(0, maxLen);
    let shouldJump = v.length === maxLen;

    // Smart auto-jump
    if (field === 'hh' && v.length === 1 && parseInt(v) > 2) {
      v = '0' + v;
      shouldJump = true;
    }

    // Bounds check
    if (v.length === 2) {
      let num = parseInt(v);
      if (field === 'hh' && num > 23) v = '23';
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

  const inputCls = 'bg-transparent text-center text-tg-text font-semibold outline-none';
  const separatorCls = 'text-tg-hint font-bold select-none px-1';

  return (
    <div className="flex items-center justify-center w-full px-3 py-2.5 rounded-xl bg-tg-bg focus-within:ring-2 focus-within:ring-tg-button border border-transparent min-h-[44px]">
      <input
        ref={hourRef}
        type="text"
        inputMode="numeric"
        placeholder="ЧЧ"
        value={seg.hh}
        onChange={(e) => handleChange('hh', e.target.value, 2, minRef)}
        onKeyDown={(e) => handleKeyDown('hh', e, null)}
        onFocus={(e) => e.target.select()}
        className={`${inputCls} w-[28px]`}
      />
      <span className={separatorCls}>:</span>
      <input
        ref={minRef}
        type="text"
        inputMode="numeric"
        placeholder="ММ"
        value={seg.min}
        onChange={(e) => handleChange('min', e.target.value, 2, null)}
        onKeyDown={(e) => handleKeyDown('min', e, hourRef)}
        onFocus={(e) => e.target.select()}
        className={`${inputCls} w-[28px]`}
      />
    </div>
  );
}

export default SegmentedTimeInput;
