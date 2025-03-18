const { Server } = require('socket.io');
const { logger } = require('../utils/logger');

let io;

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    logger.info('Client connected to socket', { socketId: socket.id });

    socket.on('start_analysis', async (data) => {
      const { companyId } = data;
      logger.info('Analysis requested for company', { companyId, socketId: socket.id });
      
      // Join a company-specific room for updates
      socket.join(`company-${companyId}`);
    });

    socket.on('disconnect', () => {
      logger.info('Client disconnected from socket', { socketId: socket.id });
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

module.exports = {
  initializeSocket,
  getIO
}; 