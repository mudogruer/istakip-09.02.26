import { useState, useRef } from 'react';
import { UIIcon, StatusIcon } from '../utils/muiIcons';

/**
 * Modern Dashboard Widget Bileşeni
 * Sürüklenebilir, boyutlandırılabilir widget kartı
 */
const DashboardWidget = ({
  id,
  title,
  icon,
  size = 'medium', // small, medium, large, wide, tall
  color = 'default', // default, primary, success, warning, danger, info
  children,
  onRemove,
  onResize,
  loading = false,
  error = null,
  actions = null,
  footer = null,
  className = '',
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const widgetRef = useRef(null);

  const sizeClasses = {
    small: 'widget-small',
    medium: 'widget-medium',
    large: 'widget-large',
    wide: 'widget-wide',
    tall: 'widget-tall',
    full: 'widget-full',
  };

  const colorClasses = {
    default: '',
    primary: 'widget-primary',
    success: 'widget-success',
    warning: 'widget-warning',
    danger: 'widget-danger',
    info: 'widget-info',
  };

  const handleDragStart = (e) => {
    if (!draggable) return;
    e.dataTransfer.setData('widget-id', id);
    e.dataTransfer.effectAllowed = 'move';
    widgetRef.current?.classList.add('widget-dragging');
    onDragStart?.(id);
  };

  const handleDragEnd = (e) => {
    widgetRef.current?.classList.remove('widget-dragging');
    onDragEnd?.(id);
  };

  const handleDragOver = (e) => {
    if (!draggable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    onDragOver?.(id);
  };

  const handleDrop = (e) => {
    if (!draggable) return;
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('widget-id');
    if (draggedId && draggedId !== id) {
      onDrop?.(draggedId, id);
    }
  };

  const sizeOptions = [
    { value: 'small', label: 'Küçük', icon: 'crop_square' },
    { value: 'medium', label: 'Orta', icon: 'check_box_outline_blank' },
    { value: 'large', label: 'Büyük', icon: 'fullscreen' },
    { value: 'wide', label: 'Geniş', icon: 'view_week' },
    { value: 'tall', label: 'Uzun', icon: 'view_agenda' },
  ];

  return (
    <div
      ref={widgetRef}
      className={`dashboard-widget ${sizeClasses[size]} ${colorClasses[color]} ${className} ${draggable ? 'widget-draggable' : ''}`}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setShowMenu(false); }}
    >
      {/* Widget Header */}
      <div className="widget-header">
        <div className="widget-title-area">
          {icon && <span className="widget-icon">{typeof icon === 'string' ? <StatusIcon icon={icon} /> : icon}</span>}
          <h3 className="widget-title">{title}</h3>
        </div>
        
        <div className="widget-actions">
          {actions}
          
          {(onRemove || onResize) && (
            <div className="widget-menu-container">
              <button
                type="button"
                className={`widget-menu-btn ${isHovered || showMenu ? 'visible' : ''}`}
                onClick={() => setShowMenu(!showMenu)}
              >
                <UIIcon name="more_vert" />
              </button>
              
              {showMenu && (
                <div className="widget-dropdown">
                  {onResize && (
                    <>
                      <div className="widget-dropdown-label">Boyut</div>
                      <div className="widget-size-options">
                        {sizeOptions.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={`widget-size-btn ${size === opt.value ? 'active' : ''}`}
                            onClick={() => { onResize(id, opt.value); setShowMenu(false); }}
                            title={opt.label}
                          >
                            <UIIcon name={opt.icon} />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  
                  {onRemove && (
                    <button
                      type="button"
                      className="widget-dropdown-item danger"
                      onClick={() => { onRemove(id); setShowMenu(false); }}
                    >
                      <UIIcon name="delete" />
                      Kaldır
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Widget Body */}
      <div className="widget-body">
        {loading ? (
          <div className="widget-loading">
            <div className="widget-spinner"></div>
            <span>Yükleniyor...</span>
          </div>
        ) : error ? (
          <div className="widget-error">
            <span className="widget-error-icon"><UIIcon name="warning" /></span>
            <span>{error}</span>
          </div>
        ) : (
          children
        )}
      </div>

      {/* Widget Footer */}
      {footer && <div className="widget-footer">{footer}</div>}

      {/* Drag Handle Indicator */}
      {draggable && isHovered && (
        <div className="widget-drag-handle" title="Sürükleyerek taşı">
          <UIIcon name="drag_indicator" />
        </div>
      )}
    </div>
  );
};

export default DashboardWidget;
