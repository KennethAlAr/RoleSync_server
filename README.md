# RoleSync - Server

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)

Servidor Node.js intermediario (Relay Server) para el ecosistema RoleSync. Gestiona las conexiones WebSocket, implementa el protocolo de emparejamiento seguro mediante OTP y enruta la información en tiempo real entre Foundry VTT y la aplicación móvil.

## Ecosistema RoleSync y Orden de Ejecución

Este repositorio es una de las tres piezas que componen el Trabajo de Fin de Grado (TFG). Para que el sistema funcione correctamente, los componentes deben iniciarse en el siguiente orden:

1. **RoleSync Server (Este repositorio):** Servidor intermediario que levanta la infraestructura de WebSockets y orquesta las salas. *(Se inicia primero)*.

2. **[RoleSync Foundry Module](https://github.com/KennethAlAr/RoleSync_module):** Módulo instalado en el VTT del Dungeon Master. Genera el código QR de vinculación al detectar el servidor.

3. **[RoleSync Mobile App](https://github.com/KennethAlAr/RoleSync_frontend):** Aplicación del jugador. Escanea el QR para establecer el túnel en tiempo real.

## Requisitos Previos

Para ejecutar o contribuir al desarrollo de este servidor, es necesario disponer de:

* **Node.js:** v22.x o superior.
* **Gestor de paquetes:** npm.

## Instalación y Configuración

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/tu-usuario/rolesync-server.git
   cd rolesync-server
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   El servidor requiere la definición del puerto de escucha. Copia la plantilla base de entorno:
   ```bash
   cp .env.example .env
   ```
   Abre el archivo `.env` resultante. Por defecto contiene `PORT=3000`. Si despliegas el servidor en una plataforma PaaS (como Render), el puerto será inyectado automáticamente por el entorno.

## Ejecución del Servidor

El proyecto utiliza `tsx` para la ejecución directa de TypeScript sin necesidad de compilación previa durante el desarrollo.

Para iniciar el servidor en entorno de desarrollo local (con modo *watch* para recarga en caliente):

```bash
npm run dev
```

Para compilar el proyecto (verificación de tipos con `tsc`) o iniciarlo en entorno de producción:

```bash
npm run build
npm start
```

El servidor confirmará su inicio mostrando en la consola: `Servidor RoleSync iniciado en el puerto 3000`.

## Arquitectura Técnica Destacada

Este componente ha sido diseñado priorizando la seguridad, la baja latencia y la eficiencia de recursos:

* **Arquitectura Relay Server:** El servidor no procesa lógica de reglas de juego ni consulta bases de datos. Actúa como un proxy de alta velocidad que enruta mensajes de estado directamente entre los clientes.
* **Seguridad Zero Trust y Middleware DRY:** Todas las conexiones se consideran no confiables por defecto. Se implementa un controlador unificado (`getAuthenticatedRoom`) que verifica criptográficamente la sesión antes de autorizar cualquier mutación de estado.
* **Aislamiento por Salas (Socket.io Rooms):** El tráfico se segmenta estrictamente utilizando el patrón `worldId:characterId`, garantizando que los eventos de una partida nunca interfieran con los de otra sesión paralela.
* **Caché OTP In-Memory con Garbage Collection:** El emparejamiento inicial utiliza códigos efímeros gestionados en la memoria RAM del servidor (Map). Un ciclo automático limpia los códigos no canjeados pasados 3 minutos (TTL) para prevenir ataques de fuerza bruta y fugas de memoria.
* **Prevención Zombie Sockets:** Sistema de desconexión forzada (Time-To-Live de 30 segundos) para sockets que no se autentican, y limpieza activa de conexiones huérfanas ante reconexiones del cliente de origen.