// src/handlers/auth.ts
import { Server, Socket } from 'socket.io';
import { mobileOtpsMap } from '../store/otpsStore';

export function authHandlers(io: Server, socket: Socket) {
  
  // 1. Foundry pide un otp para el movil
  socket.on('GENERATE_OTP', (data, callback) => {
    if (!socket.data.isAuthenticated) {
       console.warn(`[SEGURIDAD] Rechazado GENERATE_OTP de socket no autenticado.`);
       return callback({ success: false, error: 'No estás autenticado en el servidor' });
    }

    const { worldId, playerId, characterId, token } = data;

    if (!worldId || !playerId || !characterId || !token) {
      return callback({ success: false, error: 'Faltan datos para generar el OTP' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    mobileOtpsMap.set(otp, {
      worldId,
      playerId,
      characterId,
      token,
      createdAt: Date.now()
    });

    console.log(`[OTP] Generado ${otp} para el personaje ${characterId}`);
    callback({ success: true, otp });
  });

  // 2. El Móvil escanea el QR y canjea el OTP
  socket.on('REDEEM_OTP', (data, callback) => {
    const { otp } = data;

    if (!otp) {
      return callback({ success: false, error: 'No se ha enviado ningún OTP' });
    }

    const sessionData = mobileOtpsMap.get(otp);

    if (!sessionData) {
      return callback({ success: false, error: 'OTP inválido o caducado' });
    }

    mobileOtpsMap.delete(otp);

    socket.data.isAuthenticated = true;
    socket.data.worldId = sessionData.worldId;
    socket.data.playerId = sessionData.playerId;
    socket.data.characterId = sessionData.characterId;

    const roomName = `player:${sessionData.worldId}:${sessionData.characterId}`;
    socket.join(roomName);

    console.log(`[AUTH] Móvil autenticado mediante OTP. Unido a sala: ${roomName}`);

    callback({
      success: true,
      token: sessionData.token,
      worldId: sessionData.worldId,
      playerId: sessionData.playerId,
      characterId: sessionData.characterId
    });
  });

  // 3.1. Foundry se registra como Host del mundo
  socket.on('REGISTER_WORLD_HOST', (data, callback) => {
    const { worldId } = data;
    if (!worldId) {
      return callback({ success: false, error: 'Falta worldId' });
    }

    socket.data.isAuthenticated = true;
    socket.data.worldId = worldId;
    socket.data.isHost = true;

    socket.join(`host:${worldId}`);
    socket.join(`world:${worldId}`); 

    console.log(`[HOST] Foundry registrado y autenticado como árbitro del mundo: ${worldId}`);
    callback({ success: true });
  });

  // 3.2. Cualquier cliente intenta autenticarse con un token
  socket.on('AUTHENTICATE_WITH_TOKEN', (data, callback) => {
    const { token, worldId } = data;

    if (!token || !worldId) {
      callback({ success: false, error: 'Faltan token o worldId' });
      return socket.disconnect(true);
    }

    console.log(`[AUTH] Solicitando validación a Foundry para token en mundo: ${worldId}`);

    io.to(`host:${worldId}`).timeout(5000).emit(
      'VALIDATE_TOKEN', 
      { token }, 
      (err: Error | null, responses: any[]) => {
        
        if (err || !responses || responses.length === 0) {
          console.log(`[AUTH] Foundry apagado o sin respuesta para ${worldId}. Cerrando socket ${socket.id}`);
          callback({ success: false, error: 'Foundry (Host) no responde o está apagado' });
          return socket.disconnect(true);
        }

        const validation = responses[0];

        if (validation.isValid) {
          const { playerId, characterId } = validation;

          socket.data.isAuthenticated = true;
          socket.data.worldId = worldId;
          socket.data.playerId = playerId;
          socket.data.characterId = characterId;

          const roomName = `player:${worldId}:${characterId}`;
          socket.join(roomName);

          console.log(`[AUTH] Token validado por Foundry. Unido a: ${roomName}`);
          
          return callback({ success: true, playerId, characterId });
        } else {
          console.log(`[AUTH] Token rechazado por Foundry. Cerrando socket ${socket.id}`);
          callback({ success: false, error: 'Token inválido o expirado' });
          return socket.disconnect(true);
        }
      }
    );
  });
}