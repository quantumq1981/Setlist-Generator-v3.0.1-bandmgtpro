import { useEffect } from 'react';

export default function InfoModal({ isOpen, onClose, data }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onEsc = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !data) return null;

  return (
    <div className="info-modal-backdrop" onClick={onClose}>
      <div className="info-modal" onClick={(e) => e.stopPropagation()}>
        <div className="info-modal-header">
          <h4>{data.title}</h4>
          <button type="button" className="info-modal-close" onClick={onClose} aria-label="Close help modal">×</button>
        </div>
        <div className="info-modal-content">{data.content}</div>
      </div>
    </div>
  );
}
