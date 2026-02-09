import { useMemo } from 'react';

// Ülke kodları ve formatları
const COUNTRIES = [
  { code: '+90', iso: 'TR', flag: '🇹🇷', format: '### ### ## ##' },
  { code: '+49', iso: 'DE', flag: '🇩🇪', format: '### ### ####' },
  { code: '+44', iso: 'GB', flag: '🇬🇧', format: '#### ### ###' },
  { code: '+1', iso: 'US', flag: '🇺🇸', format: '### ### ####' },
  { code: '+33', iso: 'FR', flag: '🇫🇷', format: '# ## ## ## ##' },
  { code: '+31', iso: 'NL', flag: '🇳🇱', format: '## ### ####' },
  { code: '+32', iso: 'BE', flag: '🇧🇪', format: '### ## ## ##' },
  { code: '+43', iso: 'AT', flag: '🇦🇹', format: '### ### ####' },
  { code: '+41', iso: 'CH', flag: '🇨🇭', format: '## ### ## ##' },
  { code: '+46', iso: 'SE', flag: '🇸🇪', format: '## ### ## ##' },
  { code: '+47', iso: 'NO', flag: '🇳🇴', format: '### ## ###' },
  { code: '+45', iso: 'DK', flag: '🇩🇰', format: '## ## ## ##' },
  { code: '+358', iso: 'FI', flag: '🇫🇮', format: '## ### ####' },
  { code: '+39', iso: 'IT', flag: '🇮🇹', format: '### ### ####' },
  { code: '+34', iso: 'ES', flag: '🇪🇸', format: '### ### ###' },
  { code: '+30', iso: 'GR', flag: '🇬🇷', format: '### ### ####' },
  { code: '+7', iso: 'RU', flag: '🇷🇺', format: '### ### ## ##' },
  { code: '+380', iso: 'UA', flag: '🇺🇦', format: '## ### ## ##' },
  { code: '+994', iso: 'AZ', flag: '🇦🇿', format: '## ### ## ##' },
  { code: '+995', iso: 'GE', flag: '🇬🇪', format: '### ### ###' },
  { code: '+374', iso: 'AM', flag: '🇦🇲', format: '## ### ###' },
  { code: '+972', iso: 'IL', flag: '🇮🇱', format: '## ### ####' },
  { code: '+966', iso: 'SA', flag: '🇸🇦', format: '## ### ####' },
  { code: '+971', iso: 'AE', flag: '🇦🇪', format: '## ### ####' },
  { code: '+86', iso: 'CN', flag: '🇨🇳', format: '### #### ####' },
  { code: '+81', iso: 'JP', flag: '🇯🇵', format: '## #### ####' },
  { code: '+82', iso: 'KR', flag: '🇰🇷', format: '## #### ####' },
  { code: '+91', iso: 'IN', flag: '🇮🇳', format: '##### #####' },
  { code: '+61', iso: 'AU', flag: '🇦🇺', format: '### ### ###' },
  { code: '+55', iso: 'BR', flag: '🇧🇷', format: '## ##### ####' },
  { code: '+48', iso: 'PL', flag: '🇵🇱', format: '### ### ###' },
  { code: '+420', iso: 'CZ', flag: '🇨🇿', format: '### ### ###' },
  { code: '+36', iso: 'HU', flag: '🇭🇺', format: '## ### ####' },
  { code: '+40', iso: 'RO', flag: '🇷🇴', format: '### ### ###' },
  { code: '+359', iso: 'BG', flag: '🇧🇬', format: '## ### ####' },
];

// Ülke kodunu bul (en uzun eşleşmeyi önce dene)
const findCountry = (value) => {
  if (!value) return null;
  
  const clean = value.replace(/\s/g, '');
  
  // Uzundan kısaya sırala ve eşleşeni bul
  const sorted = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);
  
  for (const country of sorted) {
    if (clean.startsWith(country.code)) {
      return country;
    }
  }
  
  return null;
};

// Numarayı formatla
const formatPhone = (value) => {
  if (!value) return '';
  
  // + ile başlamıyorsa ekle
  let clean = value.replace(/[^\d+]/g, '');
  if (clean && !clean.startsWith('+')) {
    clean = '+' + clean;
  }
  
  const country = findCountry(clean);
  
  if (!country) {
    // Ülke bulunamadı, sadece + ve rakamlar
    return clean;
  }
  
  // Ülke kodundan sonraki rakamları al
  const afterCode = clean.substring(country.code.length);
  
  if (!afterCode) {
    return country.code + ' ';
  }
  
  // Formatla
  let formatted = '';
  let digitIndex = 0;
  
  for (let i = 0; i < country.format.length && digitIndex < afterCode.length; i++) {
    if (country.format[i] === '#') {
      formatted += afterCode[digitIndex];
      digitIndex++;
    } else {
      formatted += country.format[i];
    }
  }
  
  return country.code + ' ' + formatted;
};

export default function PhoneInput({ 
  value = '', 
  onChange, 
  placeholder = '+90 5XX XXX XX XX',
  required = false,
  disabled = false,
  label,
  className = ''
}) {
  // Mevcut ülkeyi tespit et
  const detectedCountry = useMemo(() => findCountry(value), [value]);
  
  const handleChange = (e) => {
    let input = e.target.value;
    
    // Sadece +, rakam ve boşluk izin ver
    input = input.replace(/[^\d+\s]/g, '');
    
    // Formatla
    const formatted = formatPhone(input);
    onChange(formatted);
  };
  
  return (
    <div className={`phone-input-wrapper ${className}`}>
      {label && <label className="form-label">{label}</label>}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        border: '1px solid var(--color-border)', 
        borderRadius: 8,
        overflow: 'hidden',
        background: disabled ? 'var(--color-bg-secondary)' : 'white'
      }}>
        {/* Ülke Badge - Otomatik algılanan */}
        <div style={{
          padding: '10px 12px',
          background: 'var(--color-bg-secondary)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 70,
          justifyContent: 'center'
        }}>
          {detectedCountry ? (
            <>
              <span style={{ fontSize: 18 }}>{detectedCountry.flag}</span>
              <span style={{ 
                fontWeight: 600, 
                fontSize: 13,
                color: 'var(--color-text)'
              }}>
                {detectedCountry.iso}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--color-text-light)' }}>🌍</span>
          )}
        </div>
        
        {/* Numara Input */}
        <input
          type="tel"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '10px 12px',
            border: 'none',
            outline: 'none',
            fontSize: 15,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            letterSpacing: 0.5,
            background: 'transparent'
          }}
        />
      </div>
    </div>
  );
}
