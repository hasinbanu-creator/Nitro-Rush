// native fetch
const CDP_HTTP = 'http://127.0.0.1:9222/json';
async function test() {
  const res = await fetch(CDP_HTTP);
  const targets = await res.json();
  const page = targets.find((t) => t.type === 'page' && t.url.includes('5173'));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 1;
  const send = (method, params) =>
    new Promise((resolve) => {
      const cur = id++;
      const onMsg = (e) => {
        const d = JSON.parse(e.data);
        if (d.id === cur) {
          ws.removeEventListener('message', onMsg);
          resolve(d.result);
        }
      };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify({ id: cur, method, params }));
    });

  const check = await send('Runtime.evaluate', {
    expression: `(() => {
      const lobby = window.__NITRO_GAME__.scene.getScene('MultiplayerLobbyScene');
      return {
        scenes: window.__NITRO_GAME__.scene.getScenes(true).map(s => s.scene.key),
        hasModal: lobby ? !!lobby.errorModalContainer : false,
        fading: lobby ? lobby.cameras.main._fadeAlpha : null
      };
    })()`,
    returnByValue: true,
  });
  console.log('Current state:', JSON.stringify(check.result.value));
  ws.close();
}
test().catch(console.error);
