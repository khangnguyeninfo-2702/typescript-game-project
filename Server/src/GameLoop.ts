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
        // Move players based on velocity/inputs
        // Move bullets, check collisions (bullets hitting shapes/players)
    }

    private broadcastState() {
        // Serialize game state and send to all connected clients
    }
}