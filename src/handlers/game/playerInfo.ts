// src/handlers/game/playerInfo.ts
import { Server, Socket } from 'socket.io';

export function playerInfoHandlers(io: Server, socket: Socket) {
  
  // Helper para verificar autenticación y obtener la sala aislada
  const getAuthenticatedRoom = (): string | null => {
    if (!socket.data.isAuthenticated || !socket.data.worldId || !socket.data.characterId) {
      console.warn(`[SEGURIDAD] Evento de PlayerInfo rechazado (no autenticado). Expulsando.`);
      socket.disconnect(true);
      return null;
    }
    return `player:${socket.data.worldId}:${socket.data.characterId}`;
  };

  // 1. Foundry -> Móvil (Carga inicial de la ficha base)
  socket.on('PLAYER_INFO', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('PLAYER_INFO', data);
    console.log(`[PLAYER_INFO] Carga inicial enrutada en ${roomName}`);
  });

  // 2. Foundry -> Móvil (Actualizaciones parciales: CA, Nivel, etc.)
  socket.on('PLAYER_UPDATE', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('PLAYER_UPDATE', data);
    console.log(`[PLAYER_INFO] Actualización parcial enrutada en ${roomName}`);
  });

  // 3. Foundry -> Móvil (Entrada y salida de estado de combate)
  socket.on('COMBAT_STATE_UPDATE', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('COMBAT_STATE_UPDATE', data);
    console.log(`[PLAYER_INFO] Estado de combate enrutado en ${roomName}`);
  });

  // 4. Móvil -> Foundry (Petición para lanzar los dados de iniciativa)
  socket.on('ROLL_INITIATIVE', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('ROLL_INITIATIVE', data);
    console.log(`[PLAYER_INFO] Petición de iniciativa enrutada en ${roomName}`);
  });
}