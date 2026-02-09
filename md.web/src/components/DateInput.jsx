import { useState, useEffect, useRef } from 'react';

/**
 * Türkçe tarih formatı input component'ı (GG.AA.YYYY)
 * Basit ve kullanışlı: Metin girişi + takvim ikonu
 * Value olarak ISO formatı (YYYY-MM-DD) alır/verir
 */
const DateInput = ({ 
  value, 
  onChange, 
  className = 'form-input', 
  placeholder = 'GG.AA.YYYY',
  min,
  max,
  disabled = false,
  id,
  name,
  style = {},
  ...props 
}) => {
  const [displayValue, setDisplayValue] = useState('');
  const hiddenDateRef = useRef(null);

  // ISO → TR formatına çevir
  useEffect(() => {
    if (value) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          setDisplayValue(`${day}.${month}.${year}`);
        }
      } catch {
        setDisplayValue('');
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e) => {
    let input = e.target.value.replace(/[^\d.]/g, '');
    
    // Otomatik nokta ekleme
    const digits = input.replace(/\./g, '');
    if (digits.length >= 2 && digits.length < 4) {
      input = digits.substring(0, 2) + '.' + digits.substring(2);
    } else if (digits.length >= 4) {
      input = digits.substring(0, 2) + '.' + digits.substring(2, 4) + '.' + digits.substring(4);
    }
    
    // Max 10 karakter (GG.AA.YYYY)
    if (input.length > 10) input = input.substring(0, 10);
    
    setDisplayValue(input);
    
    // Geçerli tarihse ISO formatına çevir
    if (input.length === 10) {
      const parts = input.split('.');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        
        if (!isNaN(date.getTime()) && date.getDate() === day && date.getMonth() === month) {
          const isoDate = date.toISOString().split('T')[0];
          onChange(isoDate);
        }
      }
    } else if (input === '') {
      onChange('');
    }
  };

  const handleHiddenDateChange = (e) => {
    const isoDate = e.target.value;
    if (isoDate) {
      onChange(isoDate);
    }
  };

  const openPicker = () => {
    if (!disabled && hiddenDateRef.current) {
      // Modern browsers
      if (hiddenDateRef.current.showPicker) {
        hiddenDateRef.current.showPicker();
      } else {
        // Fallback: focus and click
        hiddenDateRef.current.focus();
        hiddenDateRef.current.click();
      }
    }
  };

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', ...style }}>
      <input
        type="text"
        className={className}
        placeholder={placeholder}
        value={displayValue}
        onChange={handleChange}
        maxLength={10}
        disabled={disabled}
        id={id}
        name={name}
        style={{ flex: 1, paddingRight: 32 }}
        {...props}
      />
      {/* Gizli native date picker - takvim ikonuna tıklayınca açılır */}
      <input
        ref={hiddenDateRef}
        type="date"
        value={value || ''}
        onChange={handleHiddenDateChange}
        min={min}
        max={max}
        disabled={disabled}
        style={{
          position: 'absolute',
          right: 8,
          width: 24,
          height: 24,
          opacity: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        title="Takvimden seç"
      />
      {/* Takvim ikonu - görsel */}
      <span
        onClick={openPicker}
        style={{
          position: 'absolute',
          right: 8,
          fontSize: 16,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 0.7,
          pointerEvents: 'none',
        }}
      >
        📅
      </span>
    </div>
  );
};

export default DateInput;
