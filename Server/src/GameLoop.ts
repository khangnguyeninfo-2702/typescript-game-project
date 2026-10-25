// Conceptual Game Loop
const TICK_RATE = 30;

export class GameServer {
    private players = new Map<string, Player>();
    private bullets: Bullet[] = [];

    public start() {
        setInterval(() => {
            this.update();
            this.broadcastState();
        }, 1000 / TICK_RATE);
    }

    private update() {
        for (const player of players.values()) {
            if (player.x < 0) continue;

            player.x += player.vx;
            player.y += player.vy;

            player.vx *= 0.85;
            player.vy *= 0.85;

            player.x = Math.max(20, Math.min(MAP_SIZE - 20, player.x));
            player.y = Math.max(20, Math.min(MAP_SIZE - 20, player.y));
        }
    }

    private broadcastState() {
    }
}