/**
 * Estructura de Datos del Payload OTP (One-Time Password).
 * Contiene la información necesaria para vincular una sesión de Foundry VTT 
 * con la App Móvil antes de que se establezca el túnel seguro.
 * 
 * @interface MobileOtpData
 * @property {string} worldId - Identificador único del mundo/partida de Foundry.
 * @property {string} playerId - Identificador del jugador propietario del personaje.
 * @property {string} characterId - Identificador del actor/personaje asignado.
 * @property {string} token - Criptograma generado por Foundry para la sesión persistente.
 * @property {number} createdAt - Marca de tiempo (Timestamp) de creación para control de caducidad.
 */
export interface MobileOtpData {
  worldId: string;
  playerId: string;
  characterId: string;
  token: string;
  createdAt: number;
}

/**
 * Almacén de Estado en Memoria (In-Memory Key-Value Store).
 * Actúa como una caché ultrarrápida para los códigos OTP pendientes de canjear.
 * La clave (string) es el código numérico de 6 dígitos generado para el QR.
 */
export const mobileOtpsMap = new Map<string, MobileOtpData>();

// ==========================================
// RUTINA DE LIMPIEZA AUTOMÁTICA
// ==========================================

/**
 * Gestor de Ciclo de Vida (TTL - Time To Live).
 * Se ejecuta en segundo plano (cada 60 segundos) para auditar el almacén de memoria.
 * 
 * Política de Seguridad:
 * Si un OTP no ha sido canjeado en 3 minutos (180,000 ms), se considera expirado 
 * y se destruye irreversiblemente. Esto previene fugas de memoria (Memory Leaks) 
 * y mitiga ataques de fuerza bruta reduciendo drásticamente la ventana de vulnerabilidad.
 */
setInterval(() => {
  const now = Date.now();
  const THREE_MINUTES = 3 * 60 * 1000;
  
  for (const [otp, data] of mobileOtpsMap.entries()) {
    if (now - data.createdAt > THREE_MINUTES) {
      mobileOtpsMap.delete(otp);
    }
  }
}, 60 * 1000);