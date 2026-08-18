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
const qualitySelect = document.getElementById('quality-select');
const grid = document.getElementById('grid');
const emptyState = document.getElementById('empty-state');

const QUALITY_PRESETS = {
  low: { width: 1280, height: 720, frameRateIdeal: 15, frameRateMax: 24, bitrate: 1_200_000 },
  medium: { width: 1600, height: 900, frameRateIdeal: 24, frameRateMax: 30, bitrate: 3_000_000 },
  high: { width: 1920, height: 1080, frameRateIdeal: 30, frameRateMax: 60, bitrate: 6_000_000 }
};
let currentQuality = QUALITY_PRESETS.high;

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
  currentQuality = QUALITY_PRESETS[qualitySelect.value] || QUALITY_PRESETS.high;

  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: currentQuality.width },
        height: { ideal: currentQuality.height },
        frameRate: { ideal: currentQuality.frameRateIdeal, max: currentQuality.frameRateMax }
      },
      audio: true // captura áudio da aba/sistema quando o navegador permitir
    });
  } catch (err) {
    alert('Não foi possível iniciar o compartilhamento de tela: ' + err.message);
    return;
  }

  // Prioriza nitidez (texto/código) em vez de suavidade de movimento
  localStream.getVideoTracks()[0].contentHint = 'detail';

  isSharing = true;
  shareBtn.textContent = 'Parar compartilhamento';
  shareBtn.classList.add('sharing');
  qualitySelect.disabled = true;

  // Se o usuário parar pela UI nativa do navegador (botão "Parar de compartilhar")
  localStream.getVideoTracks()[0].addEventListener('ended', stopSharing);

  // Mostra a própria tela pra quem está compartilhando também poder ver
  showTile('self', `${myName} (você)`, localStream, { muted: true });

  socket.emit('start-sharing');
});

function stopSharing() {
  if (!isSharing) return;
  isSharing = false;
  shareBtn.textContent = 'Compartilhar minha tela';
  shareBtn.classList.remove('sharing');
  qualitySelect.disabled = false;

  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }

  outgoingConnections.forEach((pc) => pc.close());
  outgoingConnections.clear();

  removeTile('self');
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

async function raiseBitrate(sender) {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].maxBitrate = currentQuality.bitrate;
    await sender.setParameters(params);
  } catch (err) {
    console.warn('Não foi possível ajustar o bitrate:', err);
  }
}

// Quem está compartilhando: cria uma conexão de saída para um espectador
function connectToViewer(viewerId) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  outgoingConnections.set(viewerId, pc);

  localStream.getTracks().forEach((track) => {
    const sender = pc.addTrack(track, localStream);
    if (track.kind === 'video') raiseBitrate(sender);
  });

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

const ICONS = {
  volumeOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="4 9 9 9 13 5 13 19 9 15 4 15 4 9"/><path d="M17 8a5 5 0 0 1 0 8"/><path d="M19.5 5.5a9 9 0 0 1 0 13"/></svg>',
  volumeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="4 9 9 9 13 5 13 19 9 15 4 15 4 9"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>',
  fullscreenOpen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
  fullscreenClose: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="14" height="10" rx="2"/><path d="M22 8v6a2 2 0 0 1-2 2h-4"/><path d="M6 20v-4"/><path d="M12 20v-2"/></svg>'
};

function showTile(id, name, stream, { muted = false } = {}) {
  removeTile(id);

  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.id = `tile-${id}`;

  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = muted;
  video.srcObject = stream;

  const overlay = document.createElement('div');
  overlay.className = 'tile-overlay';

  const nameTag = document.createElement('div');
  nameTag.className = 'name-tag';
  nameTag.textContent = name;

  const controlsBar = document.createElement('div');
  controlsBar.className = 'controls-bar';

  // Botão mutar/desmutar
  const muteBtn = document.createElement('button');
  muteBtn.className = 'ctrl-btn';
  muteBtn.title = video.muted ? 'Desmutar' : 'Mutar';
  muteBtn.innerHTML = video.muted ? ICONS.volumeOff : ICONS.volumeOn;
  muteBtn.classList.toggle('active', video.muted);
  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    muteBtn.innerHTML = video.muted ? ICONS.volumeOff : ICONS.volumeOn;
    muteBtn.title = video.muted ? 'Desmutar' : 'Mutar';
    muteBtn.classList.toggle('active', video.muted);
  });

  // Slider de volume + indicador numérico (tipo OSD de TV)
  const volumeSlider = document.createElement('input');
  volumeSlider.type = 'range';
  volumeSlider.className = 'volume-slider';
  volumeSlider.min = '0';
  volumeSlider.max = '100';
  volumeSlider.value = '100';
  volumeSlider.title = 'Volume';

  const volumeValue = document.createElement('span');
  volumeValue.className = 'volume-value';
  volumeValue.textContent = '100%';

  volumeSlider.addEventListener('input', () => {
    const vol = Number(volumeSlider.value) / 100;
    video.volume = vol;
    video.muted = vol === 0;
    volumeValue.textContent = `${volumeSlider.value}%`;
    muteBtn.innerHTML = video.muted ? ICONS.volumeOff : ICONS.volumeOn;
    muteBtn.classList.toggle('active', video.muted);
  });

  // Botão tela cheia (do card, não só do vídeo, pra manter os controles acessíveis)
  const fullscreenBtn = document.createElement('button');
  fullscreenBtn.className = 'ctrl-btn';
  fullscreenBtn.title = 'Tela cheia';
  fullscreenBtn.innerHTML = ICONS.fullscreenOpen;
  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement === tile) {
      document.exitFullscreen();
    } else {
      tile.requestFullscreen?.();
    }
  });
  tile.addEventListener('fullscreenchange', () => {
    const isFs = document.fullscreenElement === tile;
    fullscreenBtn.innerHTML = isFs ? ICONS.fullscreenClose : ICONS.fullscreenOpen;
    fullscreenBtn.title = isFs ? 'Sair da tela cheia' : 'Tela cheia';
  });

  // Botão fixar em mini janela (Picture-in-Picture nativo do navegador)
  const pipBtn = document.createElement('button');
  pipBtn.className = 'ctrl-btn';
  pipBtn.title = 'Fixar em mini janela';
  pipBtn.innerHTML = ICONS.pin;
  if (document.pictureInPictureEnabled) {
    pipBtn.addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement === video) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } catch (err) {
        console.warn('Erro ao ativar mini janela (PiP):', err);
      }
    });
    video.addEventListener('enterpictureinpicture', () => pipBtn.classList.add('active'));
    video.addEventListener('leavepictureinpicture', () => pipBtn.classList.remove('active'));
  } else {
    pipBtn.disabled = true;
    pipBtn.style.opacity = '0.35';
    pipBtn.title = 'Mini janela não suportada neste navegador';
  }

  controlsBar.appendChild(muteBtn);
  controlsBar.appendChild(volumeSlider);
  controlsBar.appendChild(volumeValue);
  controlsBar.appendChild(fullscreenBtn);
  controlsBar.appendChild(pipBtn);

  overlay.appendChild(nameTag);
  overlay.appendChild(controlsBar);

  tile.appendChild(video);
  tile.appendChild(overlay);
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
