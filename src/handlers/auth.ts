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
  socket.on('AUTHENTICATE_WITH_TOKEN', (data, callback) => {
    const { token, worldId, characterId } = data || {};

    if (!token || !worldId || !characterId) {
      callback({ success: false, error: 'Faltan datos obligatorios' });
      return socket.disconnect(true);
    }

    const roomName = `${worldId}:${characterId}`;
    const room = io.sockets.adapter.rooms.get(roomName);

    // LA CLAVE: Usamos socket.to(roomName) en lugar de io.to(roomName)
    // Esto envía el evento a la sala EXCLUYENDO al emisor (el móvil).
    // Así solo Foundry lo recibe y el timeout no se queda esperando al móvil.
    const target = (room && room.size > 0) ? socket.to(roomName) : socket;

    target.timeout(5000).emit(
      'VALIDATE_TOKEN', 
      { token, worldId, characterId }, 
      (err: Error | null, responseData: any) => {
        
        if (err || !responseData || (Array.isArray(responseData) && responseData.length === 0)) {
          console.warn(`[AUTH] ⛔ Timeout o sin respuesta. Cerrando socket ${socket.id}`);
          callback({ success: false, error: 'Foundry no responde o no está conectado' });
          return socket.disconnect(true);
        }

        // Si la sala responde, es un Array. Si responde Foundry directo, es objeto.
        const validation = Array.isArray(responseData) ? responseData[0] : responseData;

        if (validation && validation.isValid) {
          socket.join(roomName);
          socket.data.isAuthenticated = true; 
          socket.data.worldId = worldId; 
          socket.data.characterId = characterId; 
          
          console.log(`[AUTH] 🟢 Token validado. Socket ${socket.id} unido a: "${roomName}"`);
          return callback({ success: true, worldId, characterId });
        } else {
          console.warn(`[AUTH] ⛔ Token rechazado. Cerrando socket ${socket.id}`);
          callback({ success: false, error: 'Token inválido o expirado' });
          return socket.disconnect(true);
        }
      }
    );
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

}

