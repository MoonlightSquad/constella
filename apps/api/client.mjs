import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:4000/api/chat/ws?matchId=test&token=' + encodeURIComponent('DUMMY'));
ws.on('open', () => {
  console.log('OPEN - handshake succeeded');
  ws.send('hello');
});
ws.on('message', (d) => {
  console.log('SERVER SENT:', d.toString());
  ws.close();
});
ws.on('error', (e) => { console.log('ERROR:', e.message); process.exit(1); });
ws.on('close', () => { process.exit(0); });
setTimeout(() => { console.log('TIMEOUT: no handshake within 3s'); process.exit(1); }, 3000);
