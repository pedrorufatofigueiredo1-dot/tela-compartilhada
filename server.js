const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const MAX_ROOM_SIZE = 10;
const rooms = new Map(); // roomId -> Set(socketId)

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  let currentRoom = null;

  // Entrar em uma sala
  socket.on('join-room', ({ roomId, name }, callback) => {
    if (!roomId || typeof roomId !== 'string') {
      return callback({ error: 'Código de sala inválido.' });
    }

    const room = rooms.get(roomId) || new Set();

    if (room.size >= MAX_ROOM_SIZE) {
      return callback({ error: `Sala cheia (máximo ${MAX_ROOM_SIZE} pessoas).` });
    }

    currentRoom = roomId;
    const userName = (name || '').trim() || `Usuário-${socket.id.slice(0, 4)}`;
    socket.data.name = userName;
    socket.data.room = roomId;
    socket.data.sharing = false;

    room.add(socket.id);
    rooms.set(roomId, room);
    socket.join(roomId);

    // Lista de quem já está na sala (e quem já está compartilhando)
    const otherUsers = Array.from(room)
      .filter((id) => id !== socket.id)
      .map((id) => {
        const s = io.sockets.sockets.get(id);
        return { id, name: s?.data?.name || 'Usuário', sharing: !!s?.data?.sharing };
      });

    callback({ ok: true, users: otherUsers, self: { id: socket.id, name: userName } });
    socket.to(roomId).emit('user-joined', { id: socket.id, name: userName });
  });

  // Avisa a sala que este usuário começou a compartilhar a tela
  socket.on('start-sharing', () => {
    if (!currentRoom) return;
    socket.data.sharing = true;
    socket.to(currentRoom).emit('user-started-sharing', {
      id: socket.id,
      name: socket.data.name
    });
  });

  socket.on('stop-sharing', () => {
    if (!currentRoom) return;
    socket.data.sharing = false;
    socket.to(currentRoom).emit('user-stopped-sharing', { id: socket.id });
  });

  // Repasse de sinalização WebRTC (ponto a ponto entre quem compartilha e quem assiste)
  socket.on('offer', ({ to, offer }) => {
    io.to(to).emit('offer', { from: socket.id, offer, name: socket.data.name });
  });

  socket.on('answer', ({ to, answer }) => {
    io.to(to).emit('answer', { from: socket.id, answer });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room) {
      room.delete(socket.id);
      if (room.size === 0) rooms.delete(currentRoom);
    }
    socket.to(currentRoom).emit('user-left', { id: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
