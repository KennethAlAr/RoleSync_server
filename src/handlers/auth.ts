// src/handlers/auth.ts
import { Server, Socket } from 'socket.io';
import { mobileOtpsMap } from '../store/otpsStore';

export function authHandlers(io: Server, socket: Socket) {
  
  // 1. Foundry pide un otp para el movil
  socket.on('GENERATE_OTP', (data, callback) => {
    console.log(`[OTP] 📥 Petición GENERATE_OTP recibida desde el socket ${socket.id}`);

    if (!socket.data.isAuthenticated) {
      console.warn(`[SEGURIDAD] ⛔ Rechazado GENERATE_OTP: El socket ${socket.id} no está autenticado.`);
      return callback({ success: false, error: 'No estás autenticado en el servidor' });
    }

    const { worldId, playerId, characterId, token } = data || {};

    if (!worldId || !characterId || !token) {
      return callback({ success: false, error: 'Faltan datos obligatorios' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

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

  // 2. El Móvil escanea el QR y canjea el OTP
  socket.on('REDEEM_OTP', (data, callback) => {
    const { otp } = data || {};
    
    if (!otp) return callback({ success: false, error: 'No se ha enviado ningún OTP' });

    const sessionData = mobileOtpsMap.get(otp);
    if (!sessionData) {
      return callback({ success: false, error: 'OTP inválido o caducado' });
    }

    mobileOtpsMap.delete(otp);

    const roomName = `${sessionData.worldId}:${sessionData.characterId}`;
    socket.join(roomName);
    
    // IMPORTANTE: Marcamos el socket del móvil como autenticado
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

  // 3. Autenticación con token guardado (Reconexión de Móvil o PC)
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
      
      // Le pedimos a Foundry que se valide a sí mismo (sin timeout, es local y directo)
      socket.emit('VALIDATE_TOKEN', { token, worldId, characterId }, (validation: any) => {
        if (validation && validation.isValid) {
          
          // 💀 CAZAFANTASMAS: Limpiar sockets antiguos de Foundry en esta sala
          const room = io.sockets.adapter.rooms.get(roomName);
          if (room) {
            for (const socketId of room) {
              const client = io.sockets.sockets.get(socketId);
              // Si encontramos otro socket que dice ser Foundry, lo cerramos
              if (client && client.data.clientType === 'foundry' && client.id !== socket.id) {
                console.log(`[SYNC] 👻 Eliminando socket fantasma de Foundry: ${client.id}`);
                client.disconnect(true);
              }
            }
          }

          // Unimos a Foundry a la sala y le ponemos la etiqueta oficial
          socket.join(roomName);
          socket.data.isAuthenticated = true;
          socket.data.clientType = 'foundry'; // Etiqueta vital
          socket.data.worldId = worldId;
          socket.data.characterId = characterId;

          console.log(`[AUTH] 🟢 Foundry conectado. Socket ${socket.id} unido a: "${roomName}"`);
          
          // Avisamos al móvil (si está conectado) de que Foundry acaba de entrar
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

      // Buscamos a Foundry en la sala
      if (room) {
        for (const socketId of room) {
          const client = io.sockets.sockets.get(socketId);
          if (client && client.data.clientType === 'foundry') {
            foundrySocket = client;
            break; // Lo encontramos
          }
        }
      }

      // Si Foundry está en la sala, le pasamos el token del móvil
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

            console.log(`[AUTH] 📱 Móvil conectado. Socket ${socket.id} unido a: "${roomName}"`);
            
            // Le decimos al móvil que Foundry está online ya que acaba de responderle
            socket.emit('FOUNDRY_STATUS', { online: true });
            
            return callback({ success: true, worldId, characterId });
          } else {
            console.warn(`[AUTH] ⛔ Foundry rechazó el token del móvil. Cerrando socket ${socket.id}`);
            callback({ success: false, error: 'Token rechazado por Foundry' });
            return socket.disconnect(true);
          }
        });

      } else {
        // Si Foundry no está en la sala, el móvil no puede entrar por seguridad
        console.warn(`[AUTH] ⛔ Móvil intentó conectar pero Foundry no está online.`);
        callback({ success: false, error: 'Foundry no está online para validar el token' });
        return socket.disconnect(true);
      }
    }
  });

  // ==========================================
  // 4. SINCRONIZACIÓN INICIAL (HANDSHAKE)
  // ==========================================
  // El móvil pide los datos nada más autenticarse, y el servidor se lo pasa a Foundry
  socket.on('REQUEST_CHARACTER_DATA', (data) => {
    // Verificamos que el socket que lo pide ya ha pasado por AUTHENTICATE_WITH_TOKEN
    if (!socket.data.isAuthenticated || !socket.data.worldId || !socket.data.characterId) {
      console.warn(`[SEGURIDAD] Rechazado REQUEST_CHARACTER_DATA: Socket no autenticado.`);
      return;
    }

    const roomName = `${socket.data.worldId}:${socket.data.characterId}`;
    
    // Lo enviamos a la sala (lo recibirá Foundry)
    socket.to(roomName).emit('REQUEST_CHARACTER_DATA', data);
    console.log(`[AUTH/SYNC] 🔄 Petición de datos iniciales enrutada en "${roomName}"`);
  });

  socket.on('REVOKE_TOKEN', (payload) => {
    console.log(`[AUTH] 🗑️ Revocando token para personaje ${payload.characterId}`);
    
    // Opcional pero recomendado: Si tienes alguna base de datos o caché (Redis/Memoria) 
    // en el servidor donde guardas sesiones activas, bórralo aquí también.
    
    // Enrutamos la orden al módulo de Foundry para que lo borre allí
    io.to(`${payload.worldId}:${payload.characterId}`).emit('REVOKE_TOKEN', payload);
  });

}

