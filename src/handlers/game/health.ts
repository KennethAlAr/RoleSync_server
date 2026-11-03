// src/handlers/game/health.ts
import { Server, Socket } from 'socket.io';

export function healthHandlers(io: Server, socket: Socket) {
  
  // Helper para verificar autenticación y obtener el nombre de la sala aislada
  const getAuthenticatedRoom = (): string | null => {
    if (!socket.data.isAuthenticated || !socket.data.worldId || !socket.data.characterId) {
      console.warn(`[SEGURIDAD] Evento de salud rechazado (socket no autenticado). Expulsando.`);
      socket.disconnect(true);
      return null;
    }
    return `player:${socket.data.worldId}:${socket.data.characterId}`;
  };

  // 1. Móvil -> Foundry (Cambio de HP actual)
  socket.on('UPDATE_HP', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('UPDATE_HP', data);
    console.log(`[HEALTH] UPDATE_HP enrutado en ${roomName}`);
  });

  // 2. Móvil -> Foundry (Cambio de HP Temporal)
  socket.on('UPDATE_TEMP_HP', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('UPDATE_TEMP_HP', data);
    console.log(`[HEALTH] UPDATE_TEMP_HP enrutado en ${roomName}`);
  });

  // 3. Foundry -> Móvil (Carga inicial de salud completa)
  socket.on('HEALTH_INFO', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('HEALTH_INFO', data);
    console.log(`[HEALTH] HEALTH_INFO enrutado en ${roomName}`);
  });

  // 4. Foundry -> Móvil (Actualización de salud desde la partida)
  socket.on('HEALTH_UPDATE', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('HEALTH_UPDATE', data);
    console.log(`[HEALTH] HEALTH_UPDATE enrutado en ${roomName}`);
  });
}