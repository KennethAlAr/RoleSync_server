import { Server, Socket } from 'socket.io';

/**
 * Manejadores de Tiradas de Salvación.
 * 
 * Enruta la información de bonificadores de salvación y gestiona las peticiones 
 * de tiradas de dados bidireccionalmente entre la App Móvil y Foundry VTT.
 */
export function savingThrowsHandlers(io: Server, socket: Socket) {
  
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
      console.warn(`[SEGURIDAD] Evento de SavingThrows rechazado (no autenticado). Expulsando.`);
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
   * Hidratación Inicial de Salvaciones.
   * Enruta el bloque completo de atributos (Fuerza, Destreza, etc.), indicando 
   * competencias y modificadores matemáticos hacia la App Móvil.
   */
  socket.on('SAVING_THROWS_INFO', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('SAVING_THROWS_INFO', data);
    console.log(`[SAVING_THROWS] SAVING_THROWS_INFO enrutado en ${roomName}`);
  });

  // ==========================================
  // 2. FLUJO: CLIENTE MÓVIL -> FOUNDRY VTT
  // (Acciones del jugador)
  // ==========================================

  /**
   * Ejecución de Tirada de Salvación.
   * Enruta la petición originada por el jugador en su dispositivo móvil para 
   * desencadenar la tirada de dados virtual (3D dice / Chat card) en Foundry VTT.
   */
  socket.on('ROLL_SAVING_THROW', (data) => {
    const roomName = getAuthenticatedRoom();
    if (!roomName) return;

    socket.to(roomName).emit('ROLL_SAVING_THROW', data);
    console.log(`[SAVING_THROWS] ROLL_SAVING_THROW enrutado en ${roomName}`);
  });
}