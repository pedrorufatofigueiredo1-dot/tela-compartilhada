const socket = io();

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

// Estado
let roomId = null;
let myId = null;
let myName = null;
let localStream = null;   // minha tela, se eu estiver compartilhando
let isSharing = false;

// id -> RTCPeerConnection (para pessoas assistindo a MINHA tela)
const outgoingConnections = new Map();
// id -> RTCPeerConnection (para telas de OUTRAS pessoas que eu assisto)
const incomingConnections = new Map();
// id -> nome (de quem está compartilhando, para exibir na grade)
const sharerNames = new Map();

// Elementos
const joinScreen = document.getElementById('join-screen');
const roomScreen = document.getElementById('room-screen');
const nameInput = document.getElementById('name-input');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const joinError = document.getElementById('join-error');
const roomNameLabel = document.getElementById('room-name-label');
const peopleCount = document.getElementById('people-count');
const shareBtn = document.getElementById('share-btn');
const grid = document.getElementById('grid');
const emptyState = document.getElementById('empty-state');

let knownUsersInRoom = 1;

joinBtn.addEventListener('click', joinRoom);
roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });

function joinRoom() {
  const name = nameInput.value.trim();
  const room = roomInput.value.trim();
  if (!room) {
    joinError.textContent = 'Digite um código de sala.';
    return;
  }
  joinBtn.disabled = true;
  socket.emit('join-room', { roomId: room, name }, (res) => {
    joinBtn.disabled = false;
    if (res.error) {
      joinError.textContent = res.error;
      return;
    }
    roomId = room;
    myId = res.self.id;
    myName = res.self.name;
    knownUsersInRoom = res.users.length + 1;

    joinScreen.style.display = 'none';
    roomScreen.style.display = 'flex';
    roomNameLabel.textContent = roomId;
    updatePeopleCount();

    // Se alguém já estava compartilhando quando eu entrei, conecto nela
    res.users.forEach((u) => {
      if (u.sharing) requestToWatch(u.id);
    });
  });
}

function updatePeopleCount() {
  peopleCount.textContent = `${knownUsersInRoom} pessoa${knownUsersInRoom !== 1 ? 's' : ''}`;
}

function updateEmptyState() {
  emptyState.style.display = grid.querySelectorAll('.tile').length ? 'none' : 'block';
}

// ---------- Compartilhar minha tela ----------

shareBtn.addEventListener('click', async () => {
  if (isSharing) {
    stopSharing();
    return;
  }
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true // captura áudio da aba/sistema quando o navegador permitir
    });
  } catch (err) {
    alert('Não foi possível iniciar o compartilhamento de tela: ' + err.message);
    return;
  }

  isSharing = true;
  shareBtn.textContent = 'Parar compartilhamento';
  shareBtn.classList.add('sharing');

  // Se o usuário parar pela UI nativa do navegador (botão "Parar de compartilhar")
  localStream.getVideoTracks()[0].addEventListener('ended', stopSharing);

  socket.emit('start-sharing');
});

function stopSharing() {
  if (!isSharing) return;
  isSharing = false;
  shareBtn.textContent = 'Compartilhar minha tela';
  shareBtn.classList.remove('sharing');

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  outgoingConnections.forEach((pc) => pc.close());
  outgoingConnections.clear();

  socket.emit('stop-sharing');
}

// Alguém entrou na sala depois de mim
socket.on('user-joined', ({ id, name }) => {
  knownUsersInRoom++;
  updatePeopleCount();
  // Se eu já estava compartilhando, conecto com quem acabou de chegar
  if (isSharing) {
    connectToViewer(id);
  }
});

socket.on('user-left', ({ id }) => {
  knownUsersInRoom = Math.max(1, knownUsersInRoom - 1);
  updatePeopleCount();

  if (outgoingConnections.has(id)) {
    outgoingConnections.get(id).close();
    outgoingConnections.delete(id);
  }
  if (incomingConnections.has(id)) {
    incomingConnections.get(id).close();
    incomingConnections.delete(id);
  }
  removeTile(id);
});

// ---------- Assistir à tela de outra pessoa ----------

socket.on('user-started-sharing', ({ id, name }) => {
  sharerNames.set(id, name);
  requestToWatch(id);
});

socket.on('user-stopped-sharing', ({ id }) => {
  if (incomingConnections.has(id)) {
    incomingConnections.get(id).close();
    incomingConnections.delete(id);
  }
  removeTile(id);
});

function requestToWatch(sharerId) {
  // Não faz nada aqui: quem compartilha é quem inicia a oferta (offer),
  // assim que ela receber "user-joined" ou a gente entrar na sala.
  // Mas caso a gente já esteja na sala e a pessoa já esteja compartilhando,
  // pedimos explicitamente para ela nos conectar:
  socket.emit('offer', { to: sharerId, offer: { type: 'request-connection' } });
}

// Quem está compartilhando: cria uma conexão de saída para um espectador
function connectToViewer(viewerId) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  outgoingConnections.set(viewerId, pc);

  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('ice-candidate', { to: viewerId, candidate: e.candidate });
    }
  };

  pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .then(() => {
      socket.emit('offer', { to: viewerId, offer: pc.localDescription });
    });
}

// Recebendo uma "offer": pode ser um pedido de conexão, ou uma offer de verdade
socket.on('offer', async ({ from, offer, name }) => {
  if (offer && offer.type === 'request-connection') {
    // Alguém está pedindo para assistir minha tela
    if (isSharing) connectToViewer(from);
    return;
  }

  // Offer de verdade: alguém está compartilhando a tela pra mim
  if (name) sharerNames.set(from, name);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  incomingConnections.set(from, pc);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('ice-candidate', { to: from, candidate: e.candidate });
    }
  };

  pc.ontrack = (e) => {
    showTile(from, sharerNames.get(from) || 'Participante', e.streams[0]);
  };

  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { to: from, answer: pc.localDescription });
});

socket.on('answer', async ({ from, answer }) => {
  const pc = outgoingConnections.get(from);
  if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async ({ from, candidate }) => {
  const pc = outgoingConnections.get(from) || incomingConnections.get(from);
  if (pc) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn('Erro ao adicionar ICE candidate', err);
    }
  }
});

// ---------- Grade de vídeos ----------

function showTile(id, name, stream) {
  removeTile(id);

  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.id = `tile-${id}`;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = name;

  tile.appendChild(video);
  tile.appendChild(label);
  grid.appendChild(tile);
  updateEmptyState();
}

function removeTile(id) {
  const el = document.getElementById(`tile-${id}`);
  if (el) el.remove();
  updateEmptyState();
}

window.addEventListener('beforeunload', () => {
  if (isSharing) stopSharing();
});
