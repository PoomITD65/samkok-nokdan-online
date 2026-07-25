import React, { createContext, useContext, useState, useCallback } from 'react';

const CardZoomContext = createContext(null);

function CardDetails({ zoomed }) {
  return (
    <>
      {zoomed.src ? (
        <img className="zoom-img" src={zoomed.src} alt={zoomed.label || ''} />
      ) : (
        <div className="zoom-img zoom-img-placeholder">?</div>
      )}
      {zoomed.label && <h3>{zoomed.label}</h3>}
      {zoomed.text && <p className="zoom-text">{zoomed.text}</p>}
      {zoomed.sublabel && <p className="zoom-subtext">{zoomed.sublabel}</p>}
    </>
  );
}

export function CardZoomProvider({ children }) {
  const [zoomed, setZoomed] = useState(null);
  const zoomCard = useCallback((card) => setZoomed(card), []);
  const closeZoom = useCallback(() => setZoomed(null), []);

  return (
    <CardZoomContext.Provider value={{ zoomCard, closeZoom }}>
      {children}

      {/* Wide screens: docked inspector panel in the side margin, always visible. */}
      <div className="card-inspector-dock">
        <div className="card-inspector-title">รายละเอียดการ์ด</div>
        {zoomed ? (
          <div className="card-inspector-body">
            <CardDetails zoomed={zoomed} />
          </div>
        ) : (
          <p className="empty-note">กดปุ่ม 🔍 บนการ์ดใดก็ได้ เพื่อดูรายละเอียดที่นี่</p>
        )}
      </div>

      {/* Narrow screens: popup modal instead (no room for a docked panel). */}
      {zoomed && (
        <div className="modal-overlay zoom-modal-mobile" onClick={closeZoom}>
          <div className="zoom-panel" onClick={(e) => e.stopPropagation()}>
            <CardDetails zoomed={zoomed} />
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
