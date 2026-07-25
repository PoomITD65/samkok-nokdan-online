import React, { useEffect, useState, useCallback } from 'react';
import { socket, emitAsync } from './socket.js';
import JoinScreen from './components/JoinScreen.jsx';
import Lobby from './components/Lobby.jsx';
import GameBoard from './components/GameBoard.jsx';
import PromptModal from './components/PromptModal.jsx';
import { buildLookups } from './gamedata.js';

const STORAGE_KEY = 'samkok_session';

export default function App() {
  const [gameData, setGameData] = useState(null);
  const [state, setState] = useState(null);
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState(null);
  const [rejoining, setRejoining] = useState(true);

  useEffect(() => {
    fetch('/api/gamedata')
      .then((r) => r.json())
      .then(setGameData)
      .catch(() => setGameData({ generals: [], roles: [], supply: [], infantry: {} }));
  }, []);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const { roomCode: rc, playerId } = JSON.parse(saved);
        emitAsync('room:rejoin', { roomCode: rc, playerId }).then((res) => {
          if (res?.ok) {
            setMyPlayerId(res.playerId);
            setRoomCode(res.roomCode);
            setState(res.state);
          } else {
            localStorage.removeItem(STORAGE_KEY);
          }
          setRejoining(false);
        });
      } else {
        setRejoining(false);
      }
    }
    function onDisconnect() {
      setConnected(false);
    }
    function onState(s) {
      setState(s);
    }
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', onState);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', onState);
    };
  }, []);

  const handleJoined = useCallback((res) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ roomCode: res.roomCode, playerId: res.playerId }));
    setMyPlayerId(res.playerId);
    setRoomCode(res.roomCode);
    setState(res.state);
    setError(null);
  }, []);

  const leaveRoom = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setMyPlayerId(null);
    setRoomCode(null);
    setState(null);
    window.location.reload();
  }, []);

  if (!gameData || rejoining) {
    return (
      <div className="center-screen">
        <div className="loading-spinner" />
        <p>กำลังโหลด...</p>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="center-screen">
        <p>กำลังเชื่อมต่อเซิร์ฟเวอร์...</p>
      </div>
    );
  }

  if (!state) {
    return <JoinScreen onJoined={handleJoined} error={error} setError={setError} />;
  }

  const myPrompt = (state.myPrompts || [])[0];
  const lookups = buildLookups(gameData);

  return (
    <>
      {state.phase === 'lobby' ? (
        <Lobby state={state} myPlayerId={myPlayerId} roomCode={roomCode} gameData={gameData} onLeave={leaveRoom} />
      ) : (
        <GameBoard state={state} myPlayerId={myPlayerId} roomCode={roomCode} gameData={gameData} onLeave={leaveRoom} />
      )}
      {myPrompt && <PromptModal prompt={myPrompt} state={state} myPlayerId={myPlayerId} lookups={lookups} />}
    </>
  );
}
