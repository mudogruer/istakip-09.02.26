import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Klavye odaklı Autocomplete Input bileşeni
 * 
 * Özellikler:
 * - Yazarken filtreleme (debounce)
 * - ↑↓ ok tuşları ile listede gezinme
 * - Enter veya Tab ile seçim
 * - Esc ile listeyi kapat
 * - "Yeni ekle" seçeneği (opsiyonel)
 */
const AutocompleteInput = ({
  value = '',
  onChange,
  onSelect,
  options = [],
  onSearch,
  placeholder = 'Ara...',
  displayKey = 'name',
  valueKey = 'id',
  renderOption,
  allowCreate = false,
  createLabel = 'Yeni ekle',
  onCreate,
  disabled = false,
  required = false,
  error = '',
  label = '',
  className = '',
  inputClassName = '',
  debounceMs = 200,
  minChars = 1,
  maxResults = 10,
  autoFocus = false,
  tabIndex = 0,
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [filteredOptions, setFilteredOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounceTimer = useRef(null);

  // Dışarıdan gelen value değiştiğinde inputValue'yu güncelle
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Filtreleme fonksiyonu
  const filterOptions = useCallback(async (searchValue) => {
    if (!searchValue || searchValue.length < minChars) {
      setFilteredOptions([]);
      setIsOpen(false);
      return;
    }

    setLoading(true);

    try {
      let results;
      
      if (onSearch) {
        // Async arama fonksiyonu varsa kullan
        results = await onSearch(searchValue);
      } else {
        // Lokal filtreleme
        const query = searchValue.toLowerCase();
        results = options.filter((opt) => {
          const displayVal = typeof opt === 'string' ? opt : opt[displayKey] || '';
          const valueVal = typeof opt === 'string' ? opt : String(opt[valueKey] || '');
          return displayVal.toLowerCase().includes(query) || valueVal.toLowerCase().includes(query);
        });
      }

      setFilteredOptions(results.slice(0, maxResults));
      setIsOpen(results.length > 0 || (allowCreate && searchValue.length > 0));
      setHighlightIndex(-1);
    } catch (err) {
      console.error('Autocomplete search error:', err);
      setFilteredOptions([]);
    } finally {
      setLoading(false);
    }
  }, [options, onSearch, displayKey, valueKey, minChars, maxResults, allowCreate]);

  // Debounce ile arama
  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange?.(newValue);

    // Debounce
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    debounceTimer.current = setTimeout(() => {
      filterOptions(newValue);
    }, debounceMs);
  };

  // Seçim yapıldığında
  const handleSelect = (option, focusNext = false) => {
    const displayVal = typeof option === 'string' ? option : option[displayKey] || '';
    const valueVal = typeof option === 'string' ? option : option[valueKey] || '';
    
    // Input'a valueKey değerini yaz (kod olarak kalsın)
    setInputValue(valueVal || displayVal);
    setIsOpen(false);
    setHighlightIndex(-1);
    onChange?.(valueVal || displayVal);
    onSelect?.(option, valueVal);
    
    // Tab ile seçildiyse sonraki input'a geç
    if (focusNext && inputRef.current) {
      const form = inputRef.current.closest('form');
      if (form) {
        const inputs = Array.from(form.querySelectorAll('input, select, textarea, button'));
        const currentIdx = inputs.indexOf(inputRef.current);
        if (currentIdx >= 0 && currentIdx < inputs.length - 1) {
          setTimeout(() => inputs[currentIdx + 1]?.focus(), 10);
        }
      }
    }
  };

  // Yeni oluşturma
  const handleCreate = () => {
    if (onCreate && inputValue) {
      onCreate(inputValue);
      setIsOpen(false);
    }
  };

  // Klavye navigasyonu
  const handleKeyDown = (e) => {
    if (!isOpen && e.key !== 'ArrowDown' && e.key !== 'Enter') return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen && inputValue.length >= minChars) {
          filterOptions(inputValue);
        } else {
          const maxIndex = allowCreate ? filteredOptions.length : filteredOptions.length - 1;
          setHighlightIndex((prev) => Math.min(prev + 1, maxIndex));
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, -1));
        break;

      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
          handleSelect(filteredOptions[highlightIndex]);
        } else if (highlightIndex === filteredOptions.length && allowCreate) {
          handleCreate();
        } else if (filteredOptions.length === 1) {
          // Tek sonuç varsa otomatik seç
          handleSelect(filteredOptions[0]);
        }
        break;

      case 'Tab':
        if (isOpen && filteredOptions.length > 0) {
          // Seçim yap ve sonraki inputa geç
          if (highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
            handleSelect(filteredOptions[highlightIndex], true);
          } else if (filteredOptions.length === 1) {
            handleSelect(filteredOptions[0], true);
          } else if (highlightIndex === filteredOptions.length && allowCreate) {
            handleCreate();
          }
          // Tab'ı engelleme - tarayıcı sonraki elemente geçsin
        } else {
          // Liste kapalı veya boşsa sadece kapat
          setIsOpen(false);
        }
        break;

      case 'Escape':
        setIsOpen(false);
        setHighlightIndex(-1);
        break;

      default:
        break;
    }
  };

  // Dışarı tıklandığında kapat
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (inputRef.current && !inputRef.current.contains(e.target) &&
          listRef.current && !listRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Highlight değiştiğinde scroll
  useEffect(() => {
    if (listRef.current && highlightIndex >= 0) {
      const items = listRef.current.querySelectorAll('.autocomplete-item');
      if (items[highlightIndex]) {
        items[highlightIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const renderOptionContent = (option, index) => {
    if (renderOption) {
      return renderOption(option, index);
    }

    const displayVal = typeof option === 'string' ? option : option[displayKey] || '';
    const valueVal = typeof option === 'string' ? '' : option[valueKey] || '';
    
    return (
      <div className="autocomplete-option-content">
        <span className="autocomplete-option-value">{valueVal}</span>
        <span className="autocomplete-option-label">{displayVal}</span>
      </div>
    );
  };

  return (
    <div className={`autocomplete-container ${className}`}>
      {label && (
        <label className="form-label">
          {label}
          {required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
        </label>
      )}
      
      <div className="autocomplete-input-wrapper" ref={inputRef}>
        <input
          type="text"
          className={`form-input ${inputClassName} ${error ? 'input-error' : ''}`}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue.length >= minChars) {
              filterOptions(inputValue);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          tabIndex={tabIndex}
          autoComplete="off"
        />
        
        {loading && (
          <div className="autocomplete-loading">
            <span className="spinner-small" />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="autocomplete-dropdown" ref={listRef}>
          {filteredOptions.length > 0 ? (
            <>
              {filteredOptions.map((option, index) => (
                <div
                  key={typeof option === 'string' ? option : option[valueKey] || index}
                  className={`autocomplete-item ${index === highlightIndex ? 'highlighted' : ''}`}
                  onClick={() => handleSelect(option)}
                  onMouseEnter={() => setHighlightIndex(index)}
                >
                  {renderOptionContent(option, index)}
                </div>
              ))}
            </>
          ) : null}
          
          {allowCreate && inputValue && (
            <div
              className={`autocomplete-item autocomplete-create ${
                highlightIndex === filteredOptions.length ? 'highlighted' : ''
              }`}
              onClick={handleCreate}
              onMouseEnter={() => setHighlightIndex(filteredOptions.length)}
            >
              <span className="autocomplete-create-icon">➕</span>
              <span>{createLabel}: "{inputValue}"</span>
            </div>
          )}
        </div>
      )}

      {error && <div className="form-error">{error}</div>}
    </div>
  );
};

export default AutocompleteInput;


