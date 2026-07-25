import React, { useEffect, useRef } from 'react';

export default function LogPanel({ log }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [log.length]);

  return (
    <div className="log-panel">
      <div className="log-title">บันทึกเกม</div>
      <div className="log-lines">
        {log.map((entry) => (
          <div key={entry.id} className="log-line">
            {entry.textTh}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
