import { useState, useEffect } from 'react';

/**
 * NumberInput - Miktar girişi için özel input
 * 
 * Özellikler:
 * - 0 değeri boş gösterilir (kullanıcı kolayca yazabilir)
 * - Boş bırakılırsa blur'da min değere döner
 * - Negatif değer engellenebilir
 */
const NumberInput = ({ 
  value, 
  onChange, 
  min = 0, 
  max,
  step = 1,
  placeholder = '',
  className = 'form-input',
  allowEmpty = false,
  ...props 
}) => {
  // Display value: 0 ise boş göster, değilse değeri göster
  const [displayValue, setDisplayValue] = useState(() => {
    if (value === 0 || value === '0' || value === '' || value === null || value === undefined) {
      return '';
    }
    return String(value);
  });

  // value prop değişirse displayValue güncelle
  useEffect(() => {
    if (value === 0 || value === '0' || value === '' || value === null || value === undefined) {
      setDisplayValue('');
    } else {
      setDisplayValue(String(value));
    }
  }, [value]);

  const handleChange = (e) => {
    const inputVal = e.target.value;
    
    // Sadece rakam ve ondalık noktaya izin ver
    if (inputVal !== '' && !/^-?\d*\.?\d*$/.test(inputVal)) {
      return;
    }
    
    setDisplayValue(inputVal);
    
    // Boş ise
    if (inputVal === '' || inputVal === '-') {
      if (allowEmpty) {
        onChange('');
      }
      return;
    }
    
    // Sayıya çevir
    const numVal = step % 1 === 0 ? parseInt(inputVal, 10) : parseFloat(inputVal);
    
    if (!isNaN(numVal)) {
      // Min/max kontrolü
      let finalVal = numVal;
      if (min !== undefined && numVal < min) finalVal = min;
      if (max !== undefined && numVal > max) finalVal = max;
      
      onChange(finalVal);
    }
  };

  const handleBlur = () => {
    // Boş bırakıldıysa min değere dön
    if (displayValue === '' || displayValue === '-') {
      if (!allowEmpty) {
        setDisplayValue(min > 0 ? String(min) : '');
        onChange(min);
      }
    } else {
      // Geçerli sayı ise formatla
      const numVal = step % 1 === 0 ? parseInt(displayValue, 10) : parseFloat(displayValue);
      if (!isNaN(numVal)) {
        let finalVal = numVal;
        if (min !== undefined && numVal < min) finalVal = min;
        if (max !== undefined && numVal > max) finalVal = max;
        setDisplayValue(String(finalVal));
        onChange(finalVal);
      }
    }
  };

  const handleFocus = (e) => {
    // Focus olduğunda tüm metni seç
    e.target.select();
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      className={className}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      placeholder={placeholder || (min > 0 ? String(min) : '0')}
      {...props}
    />
  );
};

export default NumberInput;
