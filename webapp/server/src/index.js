import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { allGameData } from './data/index.js';
import { createRoomManager } from './rooms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true }
});

app.get('/api/gamedata', (req, res) => {
  res.json(allGameData());
});

app.use('/assets', express.static(path.join(__dirname, '../../client/public/assets')));

const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/assets') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(200).send('Client build not found yet — run "npm run build" first, or use "npm run dev:client" during development.');
  });
});

createRoomManager(io);

function lanAddresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\nสามก๊ก: นอกด่านรุกราน — server running!\n`);
  console.log(`  On this computer:  http://localhost:${PORT}`);
  for (const addr of lanAddresses()) {
    console.log(`  For friends on your WiFi/LAN:  http://${addr}:${PORT}`);
  }
  console.log('');
});
