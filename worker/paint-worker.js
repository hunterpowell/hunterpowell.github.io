// Cloudflare Worker + Durable Object for multiplayer paint.exe
// One shared room ("main"). Strokes are ephemeral: when the last client
// disconnects the history is cleared, so visitors never see stale vandalism.
// Sessions are saved to DO storage for private review at /history?token=SECRET.

export class PaintRoom {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.clients = new Set();
        this.strokes = [];
    }

    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === '/history') {
            const token = url.searchParams.get('token');
            if (!token || !this.env.HISTORY_TOKEN || token !== this.env.HISTORY_TOKEN) {
                return new Response('Unauthorized', { status: 401 });
            }
            const map = await this.state.storage.list({ prefix: 'session_' });
            const sessions = [];
            for (const [, val] of map) sessions.push(val);
            sessions.sort((a, b) => b.ts - a.ts);
            return new Response(JSON.stringify(sessions), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('Expected WebSocket upgrade', { status: 426 });
        }

        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        server.accept();

        this.clients.add(server);

        const clientId = crypto.randomUUID();
        server.send(JSON.stringify({ type: 'hello', clientId }));
        server.send(JSON.stringify({ type: 'init', strokes: this.strokes }));
        this.broadcast({ type: 'users', count: this.clients.size });

        server.addEventListener('message', (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg.type === 'stroke') {
                    this.strokes.push(msg.stroke);
                    this.broadcastExcept(server, { type: 'stroke', stroke: msg.stroke });
                } else if (msg.type === 'undo') {
                    // Remove the last stroke belonging to this client.
                    for (let i = this.strokes.length - 1; i >= 0; i--) {
                        if (this.strokes[i].clientId === msg.clientId) {
                            this.strokes.splice(i, 1);
                            break;
                        }
                    }
                    this.broadcast({ type: 'reset', strokes: this.strokes });
                } else if (msg.type === 'clear') {
                    this.strokes = [];
                    this.broadcastExcept(server, { type: 'clear' });
                }
            } catch (_) {}
        });

        const onClose = () => {
            this.clients.delete(server);
            if (this.clients.size === 0) {
                if (this.strokes.length > 0) {
                    const ts = Date.now();
                    this.state.storage.put('session_' + ts, { ts, strokes: this.strokes });
                }
                this.strokes = [];
            } else {
                this.broadcast({ type: 'users', count: this.clients.size });
            }
        };
        server.addEventListener('close', onClose);
        server.addEventListener('error', onClose);

        return new Response(null, { status: 101, webSocket: client });
    }

    broadcast(msg) {
        const data = JSON.stringify(msg);
        for (const ws of this.clients) {
            try { ws.send(data); } catch (_) { this.clients.delete(ws); }
        }
    }

    broadcastExcept(exclude, msg) {
        const data = JSON.stringify(msg);
        for (const ws of this.clients) {
            if (ws === exclude) continue;
            try { ws.send(data); } catch (_) { this.clients.delete(ws); }
        }
    }
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET',
                    'Access-Control-Allow-Headers': 'Upgrade, Connection',
                },
            });
        }

        const id = env.PAINT_ROOM.idFromName('main');
        const room = env.PAINT_ROOM.get(id);

        const resp = await room.fetch(request);

        // Attach CORS headers so the portfolio (any origin) can connect.
        const headers = new Headers(resp.headers);
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(resp.body, { status: resp.status, webSocket: resp.webSocket, headers });
    },
};
