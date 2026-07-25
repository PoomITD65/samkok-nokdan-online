import React from 'react';

export default function CardImage({ src, label, sublabel, size = 'md', selected, disabled, onClick, faceDown, badge }) {
  const cls = ['card-img', `size-${size}`, selected ? 'selected' : '', disabled ? 'disabled' : '', onClick ? 'clickable' : ''].join(' ');
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
      </div>
      {label && !faceDown && <div className="card-label">{label}</div>}
      {sublabel && <div className="card-sublabel">{sublabel}</div>}
    </div>
  );
}
