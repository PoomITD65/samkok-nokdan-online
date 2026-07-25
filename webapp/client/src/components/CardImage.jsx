import React from 'react';
import { useCardZoom } from '../CardZoomContext.jsx';

export default function CardImage({ src, label, sublabel, text, size = 'md', selected, disabled, onClick, faceDown, badge, noZoom }) {
  const { zoomCard } = useCardZoom();
  const cls = ['card-img', `size-${size}`, selected ? 'selected' : '', disabled ? 'disabled' : '', onClick ? 'clickable' : ''].join(' ');
  const canZoom = !noZoom && !faceDown && (src || label);

  return (
    <div className={cls} onClick={disabled ? undefined : onClick} title={label}>
      <div className="card-img-frame">
        {faceDown ? (
          <div className="card-back-placeholder">🀄</div>
        ) : src ? (
          <img src={src} alt={label || ''} loading="lazy" />
        ) : (
          <div className="card-back-placeholder">{label?.[0] || '?'}</div>
        )}
        {badge && <div className="card-badge">{badge}</div>}
        {canZoom && (
          <button
            type="button"
            className="zoom-btn"
            title="ดูรายละเอียดการ์ด"
            onClick={(e) => {
              e.stopPropagation();
              zoomCard({ src, label, text, sublabel });
            }}
          >
            🔍
          </button>
        )}
      </div>
      {label && !faceDown && <div className="card-label">{label}</div>}
    </div>
  );
}
