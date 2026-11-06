import { Server, Socket } from 'socket.io';

/**
 * Manejadores de Estado de HP.
 * 
 * Implementa un patrón de "Relay Server" (Enrutador de Mensajes).
 * El servidor de señalización valida la identidad del emisor mediante una política 
 * de confianza cero (Zero Trust) y enruta de forma segura las actualizaciones de 
 * estado (HP, Temp HP) bidireccionalmente entre la App Móvil y Foundry VTT.
 */
export function healthHandlers(io: Server, socket: Socket) {
  
  /**
   * Middleware local de Autorización (Zero Trust).
   * Verifica criptográficamente (a través del estado inyectado previamente en auth.ts) 
   * que el socket tiene permisos para realizar una mutación de estado.
   * Aplica un corte de conexión (Kill Switch) ante cualquier petición no autorizada.
   * 
   * @returns {string | null} El identificador exacto de la sala aislada o null si no está autorizado.
   */
  const getAuthenticatedRoom = (): string | null => {
    if (!socket.data.isAuthenticated || !socket.data.worldId || !socket.data.characterId) {
      console.warn(`[SEGURIDAD] Evento de salud rechazado (socket no autenticado). Expulsando.`);
      socket.disconnect(true);
      return null;
    }
    return `${socket.data.worldId}:${socket.data.characterId}`;
  };

  // ==========================================
  // 1. FLUJO: CLIENTE MÓVIL -> FOUNDRY VTT
  // (Mutaciones originadas por el jugador)
  // ==========================================

  /**
   * Enruta la variación de Puntos de Golpe (HP) actuales.
   */
  socket.on('UPDATE_HP', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return; 

    socket.to(roomName).emit('UPDATE_HP', data);
    console.log(`[HEALTH] UPDATE_HP enrutado en ${roomName}`);
  });

  /**
   * Enruta la variación de Puntos de Golpe Temporales (Temp HP).
   */
  socket.on('UPDATE_TEMP_HP', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('UPDATE_TEMP_HP', data);
    console.log(`[HEALTH] UPDATE_TEMP_HP enrutado en ${roomName}`);
  });

  // ==========================================
  // 2. FLUJO: FOUNDRY VTT -> CLIENTE MÓVIL
  // (Replicación del estado origen al frontend)
  // ==========================================

  /**
   * Hidratación Inicial (State Hydration).
   * Enruta el bloque completo de datos de salud al conectar la app por primera vez.
   */
  socket.on('HEALTH_INFO', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('HEALTH_INFO', data);
    console.log(`[HEALTH] HEALTH_INFO enrutado en ${roomName}`);
  });

  /**
   * Sincronización Reactiva (State Deltas).
   * Enruta cambios producidos en la partida de Foundry VTT 
   * para refrescar la App Móvil en tiempo real.
   */
  socket.on('HEALTH_UPDATE', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('HEALTH_UPDATE', data);
    console.log(`[HEALTH] HEALTH_UPDATE enrutado en ${roomName}`);
  });
}