export interface MobileOtpData {
  worldId: string;
  playerId: string;
  characterId: string;
  token: string;
  createdAt: number;
}

export const mobileOtpsMap = new Map<string, MobileOtpData>();

// Limpieza automática de OTPs expirados (3 minutos)
setInterval(() => {
  const now = Date.now();
  const THREE_MINUTES = 3 * 60 * 1000;
  for (const [otp, data] of mobileOtpsMap.entries()) {
    if (now - data.createdAt > THREE_MINUTES) {
      mobileOtpsMap.delete(otp);
    }
  }
}, 60 * 1000);