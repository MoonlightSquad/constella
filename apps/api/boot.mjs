import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';

const app = Fastify();
await app.register(fastifyWebsocket, {
  options: { maxPayload: 1024 * 1024, perMessageDeflate: true, handshakeTimeout: 10000 },
});
app.get('/api/chat/ws', { websocket: true }, (socket) => {
  socket.on('message', (raw) => {
    if (socket.readyState === 1) socket.send('echo:' + raw.toString());
  });
});
await app.listen({ port: 4000, host: '127.0.0.1' });
console.log('API listening on :4000');
