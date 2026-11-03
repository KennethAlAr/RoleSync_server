// src/handlers/auth.ts
import { Server, Socket } from 'socket.io';
import { mobileOtpsMap } from '../store/otpsStore';

export function authHandlers(io: Server, socket: Socket) {
  
  // 1. Foundry pide un otp para el movil
  socket.on('GENERATE_OTP', (data, callback) => {
    console.log(`[OTP] 📥 Petición GENERATE_OTP recibida desde el socket ${socket.id}`);

    // 1. Comprobación de seguridad en la conexión del socket
    if (!socket.data.isAuthenticated) {
      console.warn(`[SEGURIDAD] ⛔ Rechazado GENERATE_OTP: El socket ${socket.id} no está autenticado en el servidor.`);
      return callback({ success: false, error: 'No estás autenticado en el servidor' });
    }

    // 2. Extracción y validación de datos del payload
    const { worldId, playerId, characterId, token } = data || {};

    console.log(`[OTP] 🔍 Datos recibidos:`, { worldId, playerId, characterId, tokenPresente: !!token });

    if (!worldId || !characterId || !token) {
      const faltantes = [];
      if (!worldId) faltantes.push('worldId');
      if (!characterId) faltantes.push('characterId');
      if (!token) faltantes.push('token');

      console.warn(`[OTP] ⚠️ Rechazado GENERATE_OTP: Faltan campos requeridos -> [${faltantes.join(', ')}]`);
      return callback({ success: false, error: `Faltan datos obligatorios: ${faltantes.join(', ')}` });
    }

    // 3. Generación del código OTP de 6 dígitos
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 4. Guardado en el mapa en memoria asociando la sala objetivo (worldId:characterId)
    mobileOtpsMap.set(otp, {
      worldId,
      playerId: playerId || 'N/A',
      characterId,
      token,
      createdAt: Date.now()
    });

    console.log(`[OTP] 🟢 OTP generado con éxito: [ ${otp} ]`);
    console.log(`[OTP] 📌 Asociado a la sala: "${worldId}:${characterId}" | Token: ${token.substring(0, 10)}...`);

    // 5. Responder al cliente de Foundry
    callback({ success: true, otp });
  });

  // 2. El Móvil escanea el QR y canjea el OTP
  socket.on('REDEEM_OTP', (data, callback) => {
    const { otp } = data || {};
    console.log(`[AUTH] 📥 Petición REDEEM_OTP recibida para OTP: [ ${otp} ]`);

    if (!otp) {
      console.warn(`[AUTH] ⚠️ Rechazado REDEEM_OTP: No se ha enviado ningún código.`);
      return callback({ success: false, error: 'No se ha enviado ningún OTP' });
    }

    const sessionData = mobileOtpsMap.get(otp);

    if (!sessionData) {
      console.warn(`[AUTH] ⛔ Rechazado REDEEM_OTP: El OTP ${otp} no existe o ya caducó.`);
      return callback({ success: false, error: 'OTP inválido o caducado' });
    }

    // Borramos el OTP para que no se reutlice
    mobileOtpsMap.delete(otp);

    // Unimos el socket del móvil a la sala privada del personaje
    const roomName = `${sessionData.worldId}:${sessionData.characterId}`;
    socket.join(roomName);

    console.log(`[AUTH] 🟢 Móvil unido a la sala: "${roomName}"`);

    // Entregamos los 3 datos al móvil
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

    console.log(`[AUTH] 📥 Petición AUTHENTICATE_WITH_TOKEN recibida desde socket ${socket.id}`);

    // 1. Verificación de datos requeridos
    if (!token || !worldId || !characterId) {
      console.warn(`[AUTH] ⚠️ Rechazado AUTHENTICATE_WITH_TOKEN: Faltan token, worldId o characterId.`);
      callback({ success: false, error: 'Faltan datos obligatorios (token, worldId, characterId)' });
      return socket.disconnect(true);
    }

    const roomName = `${worldId}:${characterId}`;
    console.log(`[AUTH] Solicitando validación a Foundry en la sala: "${roomName}"`);

    // 2. Enviamos la validación a la sala del personaje donde está escuchando Foundry
    io.to(roomName).timeout(5000).emit(
      'VALIDATE_TOKEN', 
      { token, worldId, characterId }, 
      (err: Error | null, responses: any[]) => {
        
        if (err || !responses || responses.length === 0) {
          console.warn(`[AUTH] ⛔ Foundry no respondió a la validación en "${roomName}". Cerrando socket ${socket.id}`);
          callback({ success: false, error: 'Foundry no responde o no está conectado' });
          return socket.disconnect(true);
        }

        const validation = responses[0];

        if (validation && validation.isValid) {
          // Token correcto: unimos el socket a la sala privada del personaje
          socket.join(roomName);

          console.log(`[AUTH] 🟢 Token validado por Foundry. Socket ${socket.id} unido a: "${roomName}"`);
          
          return callback({ success: true, worldId, characterId });
        } else {
          console.warn(`[AUTH] ⛔ Token rechazado por Foundry. Cerrando socket ${socket.id}`);
          callback({ success: false, error: 'Token inválido o expirado' });
          return socket.disconnect(true);
        }
      }
    );
  });
}