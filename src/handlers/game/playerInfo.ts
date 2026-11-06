import { Server, Socket } from 'socket.io';

/**
 * Manejadores de Información del Personaje.
 * 
 * Implementa el enrutamiento de datos estáticos y de progresión del personaje (Clase, Nivel, CA),
 * así como los eventos de estado general de la partida (Combate e Iniciativa) entre la 
 * App Móvil y Foundry VTT.
 */
export function playerInfoHandlers(io: Server, socket: Socket) {
  
  /**
   * Middleware local de Autorización (Zero Trust).
   * Verifica criptográficamente (a través del estado inyectado previamente en auth.ts) 
   * que el socket tiene permisos para participar en la sala.
   * Aplica un corte de conexión (Kill Switch) ante cualquier petición no autorizada.
   * 
   * @returns {string | null} El identificador exacto de la sala aislada o null si no está autorizado.
   */
  const getAuthenticatedRoom = (): string | null => {
    if (!socket.data.isAuthenticated || !socket.data.worldId || !socket.data.characterId) {
      console.warn(`[SEGURIDAD] Evento de PlayerInfo rechazado (no autenticado). Expulsando.`);
      socket.disconnect(true);
      return null;
    }
    return `${socket.data.worldId}:${socket.data.characterId}`;
  };

  // ==========================================
  // 1. FLUJO: FOUNDRY VTT -> CLIENTE MÓVIL
  // (Sincronización de datos base)
  // ==========================================

  /**
   * Hidratación Inicial de la Ficha.
   * Enruta el bloque principal de datos del personaje al conectar la app por primera vez.
   */
  socket.on('PLAYER_INFO', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('PLAYER_INFO', data);
    console.log(`[PLAYER_INFO] Carga inicial enrutada en ${roomName}`);
  });

  /**
   * Sincronización de Progresión y Atributos.
   * Enruta modificaciones realizadas en el PC del Dungeon Master (subidas de nivel, 
   * cambios en la Clase de Armadura, etc.) hacia la App Móvil.
   */
  socket.on('PLAYER_UPDATE', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('PLAYER_UPDATE', data);
    console.log(`[PLAYER_INFO] Actualización parcial enrutada en ${roomName}`);
  });

  /**
   * Transiciones de Estado del Encuentro.
   * Enruta la señal de inicio o fin de un encuentro de combate.
   */
  socket.on('COMBAT_STATE_UPDATE', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('COMBAT_STATE_UPDATE', data);
    console.log(`[PLAYER_INFO] Estado de combate enrutado en ${roomName}`);
  });

  // ==========================================
  // 2. FLUJO: CLIENTE MÓVIL -> FOUNDRY VTT
  // (Acciones del jugador)
  // ==========================================

  /**
   * Ejecución de Acciones de Sistema.
   * Enruta la petición del jugador para desencadenar la macro de tirada de iniciativa 
   * directamente en el canvas de Foundry VTT.
   */
  socket.on('ROLL_INITIATIVE', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('ROLL_INITIATIVE', data);
    console.log(`[PLAYER_INFO] Petición de iniciativa enrutada en ${roomName}`);
  });
}