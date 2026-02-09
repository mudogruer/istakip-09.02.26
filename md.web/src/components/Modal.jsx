const Modal = ({ open, isOpen, title, children, actions, onClose, size = 'medium' }) => {
  // Her iki prop'u da destekle: open veya isOpen
  const shouldShow = open || isOpen;
  if (!shouldShow) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'}>
      <div className={`modal modal-${size}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {actions ? <div className="modal-footer">{actions}</div> : null}
      </div>
    </div>
  );
};

export default Modal;
