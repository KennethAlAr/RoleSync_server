import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config/env';

const app = express();
const httpServer = createServer(app);

// Configuración de WebSockets con CORS abierto para desarrollo
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middlewares globales de Express
app.use(cors());
app.use(express.json());

// Ruta HTTP de prueba para comprobar que el servidor está vivo
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'RoleSync Server' });
});

// Arrancar servidor HTTP
httpServer.listen(config.port, () => {
  console.log(`🚀 Servidor RoleSync corriendo en http://localhost:${config.port}`);
});