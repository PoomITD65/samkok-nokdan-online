import React, { createContext, useContext, useState, useCallback } from 'react';

const CardZoomContext = createContext(null);

export function CardZoomProvider({ children }) {
  const [zoomed, setZoomed] = useState(null);
  const zoomCard = useCallback((card) => setZoomed(card), []);
  const closeZoom = useCallback(() => setZoomed(null), []);

  return (
    <CardZoomContext.Provider value={{ zoomCard, closeZoom }}>
      {children}
      {zoomed && (
        <div className="modal-overlay" onClick={closeZoom}>
          <div className="zoom-panel" onClick={(e) => e.stopPropagation()}>
            {zoomed.src ? (
              <img className="zoom-img" src={zoomed.src} alt={zoomed.label || ''} />
            ) : (
              <div className="zoom-img zoom-img-placeholder">?</div>
            )}
            {zoomed.label && <h3>{zoomed.label}</h3>}
            {zoomed.text && <p className="zoom-text">{zoomed.text}</p>}
            {zoomed.sublabel && <p className="zoom-subtext">{zoomed.sublabel}</p>}
            <button className="btn ghost" onClick={closeZoom}>
              ปิด
            </button>
          </div>
        </div>
      )}
    </CardZoomContext.Provider>
  );
}

export function useCardZoom() {
  const ctx = useContext(CardZoomContext);
  if (!ctx) throw new Error('useCardZoom must be used within CardZoomProvider');
  return ctx;
}
