import 'dotenv/config';
import http from 'http';
import { Server, Socket } from 'socket.io';
import { authHandlers } from './handlers/auth';
import { playerInfoHandlers } from './handlers/game/playerInfo';
import { healthHandlers } from './handlers/game/health';
import { savingThrowsHandlers } from './handlers/game/savingThrows';

const server = http.createServer();

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket: Socket) => {
  console.log(`[+] Nueva conexión detectada: ${socket.id}`);

  socket.data.isAuthenticated = false;

  setTimeout(() => {
    if (!socket.data.isAuthenticated) {
      console.warn(`[SEGURIDAD] Socket ${socket.id} no se autenticó tras 30s. Desconectando socket.`);
      socket.disconnect(true);
    }
  }, 30000);
  
  authHandlers(io, socket);
  playerInfoHandlers(io, socket);
  healthHandlers(io, socket);
  savingThrowsHandlers(io, socket);

  socket.on('disconnect', () => {
    console.log(`[-] Socket desconectado: ${socket.id}`);
  });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor RoleSync (Puro WebSocket) iniciado en el puerto ${PORT}`);
});