import 'dotenv/config';
import http from 'http';
import { Server, Socket } from 'socket.io';
import { authHandlers } from './handlers/auth';
import { playerInfoHandlers } from './handlers/game/playerInfo';
import { healthHandlers } from './handlers/game/health';
import { savingThrowsHandlers } from './handlers/game/savingThrows';

// ==========================================
// 1. INICIALIZACIÓN DEL SERVIDOR BASE
// ==========================================

/**
 * Servidor HTTP de respaldo (Healthcheck).
 * Útil para que los servicios en la nube (como Render o AWS) puedan hacer pings 
 * periódicos y comprobar que la instancia del servidor está viva (Up & Running).
 */
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('RoleSync Server OK');
});

/**
 * Instancia Principal del Servidor WebSocket (Socket.io).
 * Configurado con CORS permisivo ('*') dado que los clientes (App Móvil en React Native 
 * y Módulo de Foundry VTT) no operan bajo el mismo dominio de origen estricto que un navegador.
 */
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ==========================================
// 2. ORQUESTACIÓN DE CONEXIONES Y SEGURIDAD
// ==========================================

io.on('connection', (socket: Socket) => {
  console.log(`[+] Nueva conexión TCP detectada: ${socket.id}`);

  // Bandera inicial: Toda conexión se considera "No Confiable" (Zero Trust) por defecto
  socket.data.isAuthenticated = false;

  /**
   * Mecanismo de Seguridad: Prevención de Conexiones Zombi (DDoS / Resource Exhaustion).
   * Otorga un Time-To-Live (TTL) de 30 segundos para que el cliente demuestre su identidad
   * (mediante Token u OTP). Si no lo hace, se fuerza el cierre del túnel para liberar memoria RAM.
   */
  setTimeout(() => {
    if (!socket.data.isAuthenticated) {
      console.warn(`[SEGURIDAD] Socket ${socket.id} no se autenticó tras 30s. Desconectando socket.`);
      socket.disconnect(true);
    }
  }, 30000);
  
  // ==========================================
  // 3. INYECCIÓN DE DEPENDENCIAS (HANDLERS)
  // ==========================================
  // Delegamos el enrutamiento de eventos a módulos especializados (SRP - Single Responsibility Principle)
  authHandlers(io, socket);
  playerInfoHandlers(io, socket);
  healthHandlers(io, socket);
  savingThrowsHandlers(io, socket);

  // ==========================================
  // 4. CICLO DE VIDA: DESCONEXIÓN Y PRESENCIA
  // ==========================================
  
  socket.on('disconnect', () => {
    console.log(`[-] Socket desconectado: ${socket.id}`);
    
    // Sistema de Presencia Dirigida (Targeted Presence Alert).
    // Si el nodo que ha caído es el servidor de origen (Foundry VTT),
    // localizamos su sala específica y notificamos al cliente móvil asociado.
    if (socket.data.isAuthenticated && socket.data.clientType === 'foundry') {
      const roomName = `${socket.data.worldId}:${socket.data.characterId}`;
      console.log(`[SYNC] 🔴 Foundry desconectado de la sala ${roomName}. Avisando al móvil...`);
      
      // Emite exclusivamente a los integrantes de la sala, ahorrando ancho de banda global
      socket.to(roomName).emit('FOUNDRY_STATUS', { online: false });
    }
  });
});

// ==========================================
// 5. ARRANQUE DEL PUERTO (BOOTSTRAP)
// ==========================================

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Escucha en '0.0.0.0' para aceptar tráfico externo, un requisito fundamental en contenedores Docker y PaaS (Render).
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor RoleSync iniciado en el puerto ${PORT}`);
});