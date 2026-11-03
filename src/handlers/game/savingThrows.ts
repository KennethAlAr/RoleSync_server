// src/handlers/game/savingThrows.ts
import { Server, Socket } from 'socket.io';

export function savingThrowsHandlers(io: Server, socket: Socket) {
  
  // Helper para verificar autenticación y obtener la sala aislada
  const getAuthenticatedRoom = (): string | null => {
    if (!socket.data.isAuthenticated || !socket.data.worldId || !socket.data.characterId) {
      console.warn(`[SEGURIDAD] Evento de SavingThrows rechazado (no autenticado). Expulsando.`);
      socket.disconnect(true);
      return null;
    }
    return `${socket.data.worldId}:${socket.data.characterId}`;
  };

  // 1. Foundry -> Móvil (Carga inicial de la lista de tiradas de salvación)
  socket.on('SAVING_THROWS_INFO', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('SAVING_THROWS_INFO', data);
    console.log(`[SAVING_THROWS] SAVING_THROWS_INFO enrutado en ${roomName}`);
  });

  // 2. Móvil -> Foundry (Petición para lanzar una tirada de salvación)
  socket.on('ROLL_SAVING_THROW', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('ROLL_SAVING_THROW', data);
    console.log(`[SAVING_THROWS] ROLL_SAVING_THROW enrutado en ${roomName}`);
  });
}