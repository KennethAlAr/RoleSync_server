import { Server, Socket } from 'socket.io';
import { mobileOtpsMap } from '../store/otpsStore';

/**
 * Manejadores de Autenticación y Ciclo de Sesión (Auth Handlers).
 * 
 * Gestiona el protocolo de emparejamiento seguro y validación de identidad 
 * entre los clientes (App Móvil) y la fuente de verdad (Módulo Foundry VTT).
 * Implementa flujos de autenticación de Doble Factor / OTP y control de salas aisladas.
 */
export function authHandlers(io: Server, socket: Socket) {
  
  /**
   * 1. Generación de OTP (One-Time Password).
   * Solicitada por Foundry VTT para iniciar el proceso de vinculación mediante código QR.
   * Valida permisos y almacena un token efímero de 6 dígitos con tiempo de vida limitado.
   */
  socket.on('GENERATE_OTP', (data, callback) => {
    console.log(`[OTP] Petición GENERATE_OTP recibida desde el socket ${socket.id}`);

    if (!socket.data.isAuthenticated) {
      console.warn(`[SEGURIDAD] ⛔ Rechazado GENERATE_OTP: El socket ${socket.id} no está autenticado.`);
      return callback({ success: false, error: 'No estás autenticado en el servidor' });
    }

    const { worldId, playerId, characterId, token } = data || {};

    if (!worldId || !characterId || !token) {
      return callback({ success: false, error: 'Faltan datos obligatorios' });
    }

    // Generación de un código numérico aleatorio de 6 dígitos
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Persistencia efímera en memoria del servidor
    mobileOtpsMap.set(otp, {
      worldId,
      playerId: playerId || 'N/A',
      characterId,
      token,
      createdAt: Date.now()
    });

    console.log(`[OTP] 🟢 OTP generado: [ ${otp} ] para la sala "${worldId}:${characterId}"`);
    callback({ success: true, otp });
  });

  /**
   * 2. Canjeo de OTP (Mobile Pairing).
   * Invocado cuando la App Móvil escanea el código QR. Valida el OTP, asocia el socket 
   * a la sala privada del personaje (`worldId:characterId`) y eleva el nivel de confianza del cliente.
   */
  socket.on('REDEEM_OTP', (data, callback) => {
    const { otp } = data || {};
    
    if (!otp) return callback({ success: false, error: 'No se ha enviado ningún OTP' });

    const sessionData = mobileOtpsMap.get(otp);
    if (!sessionData) {
      return callback({ success: false, error: 'OTP inválido o caducado' });
    }

    // Política de uso único (Single-Use Token): Se destruye el OTP inmediatamente tras su lectura
    mobileOtpsMap.delete(otp);

    const roomName = `${sessionData.worldId}:${sessionData.characterId}`;
    socket.join(roomName);
    
    // Elevación de privilegios: Marcamos el socket del móvil como autenticado
    socket.data.isAuthenticated = true;
    socket.data.worldId = sessionData.worldId; 
    socket.data.characterId = sessionData.characterId; 

    console.log(`[AUTH] 🟢 Móvil unido a la sala: "${roomName}"`);

    callback({
      success: true,
      token: sessionData.token,
      worldId: sessionData.worldId,
      characterId: sessionData.characterId
    });
  });

  /**
   * 3. Autenticación Persistente con Token (Reconexión).
   * Maneja tanto las reconexiones del Módulo de Foundry como las de la App Móvil.
   * Actúa como un Proxy de Validación: el servidor en la nube delega la comprobación 
   * criptográfica de los tokens al servidor local de Foundry VTT.
   */
  socket.on('AUTHENTICATE_WITH_TOKEN', (payload, callback) => {
    const { token, worldId, characterId, clientType } = payload || {};

    if (!token || !worldId || !characterId) {
      callback({ success: false, error: 'Faltan datos obligatorios' });
      return socket.disconnect(true);
    }

    const roomName = `${worldId}:${characterId}`;

    // ==========================================
    // 1. SI EL QUE SE CONECTA ES FOUNDRY
    // ==========================================
    if (clientType === 'foundry') {
      
      // Validación local directa contra la instancia de Foundry VTT
      socket.emit('VALIDATE_TOKEN', { token, worldId, characterId }, (validation: any) => {
        if (validation && validation.isValid) {
          
          // Socket Cleanup: 
          // Limpia sockets huérfanos anteriores de Foundry en la misma sala para evitar fugas de eventos
          const room = io.sockets.adapter.rooms.get(roomName);
          if (room) {
            for (const socketId of room) {
              const client = io.sockets.sockets.get(socketId);
              if (client && client.data.clientType === 'foundry' && client.id !== socket.id) {
                console.log(`[SYNC] Eliminando socket fantasma de Foundry: ${client.id}`);
                client.disconnect(true);
              }
            }
          }

          // Registro oficial de la conexión del Dungeon Master
          socket.join(roomName);
          socket.data.isAuthenticated = true;
          socket.data.clientType = 'foundry';
          socket.data.worldId = worldId;
          socket.data.characterId = characterId;

          console.log(`[AUTH] 🟢 Foundry conectado. Socket ${socket.id} unido a: "${roomName}"`);
          
          // Notificación de presencia en tiempo real al cliente móvil vinculado
          socket.to(roomName).emit('FOUNDRY_STATUS', { online: true });
          
          return callback({ success: true, worldId, characterId });
        } else {
          console.warn(`[AUTH] ⛔ Validación local de Foundry fallida. Cerrando socket ${socket.id}`);
          callback({ success: false, error: 'Validación local fallida' });
          return socket.disconnect(true);
        }
      });

    // ==========================================
    // 2. SI EL QUE SE CONECTA ES EL MÓVIL
    // ==========================================
    } else {
      
      const room = io.sockets.adapter.rooms.get(roomName);
      let foundrySocket: any = null;

      // Localiza el nodo de Foundry activo dentro de la sala de la partida
      if (room) {
        for (const socketId of room) {
          const client = io.sockets.sockets.get(socketId);
          if (client && client.data.clientType === 'foundry') {
            foundrySocket = client;
            break; 
          }
        }
      }

      // Si Foundry está presente, le delegamos la validación del token del móvil mediante RPC (Remote Procedure Call)
      if (foundrySocket) {
        
        foundrySocket.timeout(5000).emit('VALIDATE_TOKEN', { token, worldId, characterId }, (err: Error | null, responseData: any) => {
          if (err || !responseData || (Array.isArray(responseData) && responseData.length === 0)) {
            console.warn(`[AUTH] ⛔ Timeout: Foundry no responde al móvil. Cerrando socket ${socket.id}`);
            callback({ success: false, error: 'Foundry no responde (Timeout)' });
            return socket.disconnect(true);
          }

          const validation = Array.isArray(responseData) ? responseData[0] : responseData;

          if (validation && validation.isValid) {
            socket.join(roomName);
            socket.data.isAuthenticated = true;
            socket.data.clientType = 'mobile';
            socket.data.worldId = worldId;
            socket.data.characterId = characterId;

            console.log(`[AUTH] Móvil conectado. Socket ${socket.id} unido a: "${roomName}"`);
            
            // Confirma al móvil el estado activo de Foundry
            socket.emit('FOUNDRY_STATUS', { online: true });
            
            return callback({ success: true, worldId, characterId });
          } else {
            console.warn(`[AUTH] ⛔ Foundry rechazó el token del móvil. Cerrando socket ${socket.id}`);
            callback({ success: false, error: 'Token rechazado por Foundry' });
            return socket.disconnect(true);
          }
        });

      } else {
        // Política de seguridad: Si el PC del jugador está apagado, el móvil no puede establecer sesión
        console.warn(`[AUTH] ⛔ Móvil intentó conectar pero Foundry no está online.`);
        callback({ success: false, error: 'Foundry no está online para validar el token' });
        return socket.disconnect(true);
      }
    }
  });

  // ==========================================
  // 4. SINCRONIZACIÓN INICIAL Y REVOCACIÓN
  // ==========================================
  
  /**
   * Petición de rehidratación inicial de datos del personaje.
   * Enruta el evento desde el móvil hacia la instancia de Foundry VTT dentro de la sala.
   */
  socket.on('REQUEST_CHARACTER_DATA', (data) => {
    if (!socket.data.isAuthenticated || !socket.data.worldId || !socket.data.characterId) {
      console.warn(`[SEGURIDAD] Rechazado REQUEST_CHARACTER_DATA: Socket no autenticado.`);
      return;
    }

    const roomName = `${socket.data.worldId}:${socket.data.characterId}`;
    socket.to(roomName).emit('REQUEST_CHARACTER_DATA', data);
    console.log(`[AUTH/SYNC] Petición de datos iniciales enrutada en "${roomName}"`);
  });

  /**
   * Destrucción de credenciales (Logout).
   * Notifica tanto al servidor como al módulo de Foundry para revocar el token activo.
   */
  socket.on('REVOKE_TOKEN', (payload) => {
    console.log(`[AUTH] Revocando token para personaje ${payload.characterId}`);
    io.to(`${payload.worldId}:${payload.characterId}`).emit('REVOKE_TOKEN', payload);
  });

}