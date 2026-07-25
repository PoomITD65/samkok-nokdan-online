import { io } from 'socket.io-client';

export const socket = io({
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnectionDelay: 400,
  reconnectionDelayMax: 2000,
  timeout: 8000
});

export function emitAsync(event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (res) => resolve(res));
  });
}
