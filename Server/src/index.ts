import { WebSocketServer, WebSocket } from 'ws';

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

const MAP_SIZE = 3000;

interface PlayerStats {
    healthRegen: number;
    maxHealth: number;
    bulletDamage: number;
    bulletSpeed: number;
    reload: number;
    movementSpeed: number;
}

interface Player {
    id: string;
    name: string;
    x: number;
    y: number;
    angle: number;
    score: number;
    level: number;
    skillPoints: number;
    health: number;
    maxHealth: number;
    stats: PlayerStats;
    ws: WebSocket;
}

interface Bullet {
    id: string;
    playerId: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    radius: number;
    damage: number;
}

interface Shape {
    id: string;
    type: 'square' | 'triangle' | 'pentagon';
    x: number;
    y: number;
    vx: number;
    vy: number;
    health: number;
    maxHealth: number;
    radius: number;
    points: number;
}

const players = new Map<string, Player>();
let bullets: Bullet[] = [];
let shapes: Shape[] = [];
let bulletIdCounter = 0;
let shapeIdCounter = 0;

function spawnShapes() {
    while (shapes.length < 35) {
        const types: ('square' | 'triangle' | 'pentagon')[] = ['square', 'triangle', 'pentagon'];
        const type = types[Math.floor(Math.random() * types.length)];
        
        let health = 15;
        let radius = 15;
        let points = 10;

        if (type === 'triangle') { health = 30; radius = 20; points = 25; }
        if (type === 'pentagon') { health = 100; radius = 30; points = 100; }

        shapes.push({
            id: `s_${shapeIdCounter++}`,
            type,
            x: Math.random() * (MAP_SIZE - 200) + 100,
            y: Math.random() * (MAP_SIZE - 200) + 100,
            vx: 0,
            vy: 0,
            health,
            maxHealth: health,
            radius,
            points
        });
    }
}
spawnShapes();

function respawnPlayer(player: Player) {
    // Diep.io penalty: lose score/levels upon death
    player.score = Math.max(0, Math.floor(player.score * 0.75));
    player.level = Math.max(1, Math.floor(player.score / 100) + 1);
    
    // Set coordinates to negative so the client knows you are dead and opens the menu
    player.x = -1000;
    player.y = -1000;
    
    // Reset health for when you click Play again
    player.maxHealth = 100 + (player.stats.maxHealth * 20);
    player.health = player.maxHealth;
}

console.log(`🎮 Game WebSocket server running on ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
    const id = Math.random().toString(36).substring(2, 9);
    
    const newPlayer: Player = {
        id,
        name: 'Unnamed',
        x: -1000, // off-screen until joined
        y: -1000,
        angle: 0,
        score: 0,
        level: 1,
        skillPoints: 0,
        health: 100,
        maxHealth: 100,
        stats: { healthRegen: 0, maxHealth: 0, bulletDamage: 0, bulletSpeed: 0, reload: 0, movementSpeed: 0 },
        ws
    };

    players.set(id, newPlayer);

    ws.send(JSON.stringify({ type: 'INIT', id }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            const player = players.get(id);
            if (!player) return;

            if (data.type === 'JOIN_GAME') {
                player.name = data.name || 'Tanker';
                player.x = Math.floor(Math.random() * 1000) + 1000;
                player.y = Math.floor(Math.random() * 1000) + 1000;
                player.maxHealth = 100 + (player.stats.maxHealth * 20);
                player.health = player.maxHealth;
            }
            else if (data.type === 'INPUT' && player.x > 0) {
                const baseSpeed = 4;
                const speed = baseSpeed + (player.stats.movementSpeed * 0.4);
                if (data.keys.w) player.y = Math.max(0, player.y - speed);
                if (data.keys.s) player.y = Math.min(MAP_SIZE, player.y + speed);
                if (data.keys.a) player.x = Math.max(0, player.x - speed);
                if (data.keys.d) player.x = Math.min(MAP_SIZE, player.x + speed);
                player.angle = data.angle || 0;
            } 
            else if (data.type === 'SHOOT' && player.x > 0) {
                const baseBulletSpeed = 10;
                const bulletSpeed = baseBulletSpeed + (player.stats.bulletSpeed * 0.8);
                const bulletDamage = 10 + (player.stats.bulletDamage * 5);

                bullets.push({
                    id: `b_${bulletIdCounter++}`,
                    playerId: id,
                    x: player.x + Math.cos(player.angle) * 35,
                    y: player.y + Math.sin(player.angle) * 35,
                    vx: Math.cos(player.angle) * bulletSpeed,
                    vy: Math.sin(player.angle) * bulletSpeed,
                    life: 60,
                    radius: 8,
                    damage: bulletDamage
                });
            }
            else if (data.type === 'UPGRADE_STAT') {
                const statName = data.stat as keyof PlayerStats;
                if (player.skillPoints > 0 && player.stats[statName] !== undefined && player.stats[statName] < 7) {
                    player.stats[statName]++;
                    player.skillPoints--;
                    if (statName === 'maxHealth') {
                        player.maxHealth = 100 + (player.stats.maxHealth * 20);
                        player.health = player.maxHealth;
                    }
                }
            }
        } catch (err) {
            console.error('Failed to parse message', err);
        }
    });

    ws.on('close', () => {
        players.delete(id);
    });
});

// Game Loop (30 Ticks Per Second)
setInterval(() => {
    // 1. Update Bullets & Collisions (Shapes & Players)
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.life--;

        let bulletRemoved = false;

        // Check collision with shapes
        for (let j = shapes.length - 1; j >= 0; j--) {
            const shape = shapes[j];
            const dx = b.x - shape.x;
            const dy = b.y - shape.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < b.radius + shape.radius) {
                shape.health -= b.damage;
                bulletRemoved = true;

                if (shape.health <= 0) {
                    const killer = players.get(b.playerId);
                    if (killer) {
                        killer.score += shape.points;
                        const newLevel = Math.floor(killer.score / 100) + 1;
                        if (newLevel > killer.level) {
                            killer.skillPoints += (newLevel - killer.level);
                            killer.level = newLevel;
                        }
                    }
                    shapes.splice(j, 1);
                }
                break;
            }
        }

        // Check collision with other players
        if (!bulletRemoved) {
            for (const targetPlayer of players.values()) {
                // Don't hit yourself, and ignore unspawned players
                if (targetPlayer.id === b.playerId || targetPlayer.x < 0) continue;

                const dx = b.x - targetPlayer.x;
                const dy = b.y - targetPlayer.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const playerRadius = 20;

                if (dist < b.radius + playerRadius) {
                    targetPlayer.health -= b.damage;
                    bulletRemoved = true;

                    // Check if target player died from the bullet
                    if (targetPlayer.health <= 0) {
                        const killer = players.get(b.playerId);
                        if (killer) {
                            // Reward killer with score based on victim's level
                            const bounty = targetPlayer.level * 50;
                            killer.score += bounty;
                            const newLevel = Math.floor(killer.score / 100) + 1;
                            if (newLevel > killer.level) {
                                killer.skillPoints += (newLevel - killer.level);
                                killer.level = newLevel;
                            }
                        }
                        respawnPlayer(targetPlayer);
                    }
                    break;
                }
            }
        }

        if (bulletRemoved || b.life <= 0 || b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE) {
            bullets.splice(i, 1);
        }
    }

    // 2. Shapes drift physics
    for (const shape of shapes) {
        shape.x += shape.vx;
        shape.y += shape.vy;
        shape.vx *= 0.85;
        shape.vy *= 0.85;
        shape.x = Math.max(shape.radius, Math.min(MAP_SIZE - shape.radius, shape.x));
        shape.y = Math.max(shape.radius, Math.min(MAP_SIZE - shape.radius, shape.y));
    }

    // 3. Player-to-Shape collision resistance
    for (const player of players.values()) {
        if (player.x < 0) continue;

        for (let j = shapes.length - 1; j >= 0; j--) {
            const shape = shapes[j];
            const dx = player.x - shape.x;
            const dy = player.y - shape.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = 20 + shape.radius;

            if (dist < minDist) {
                const overlap = minDist - dist;
                const nx = dx / (dist || 1);
                const ny = dy / (dist || 1);

                player.x += nx * (overlap * 0.5);
                player.y += ny * (overlap * 0.5);
                shape.vx -= nx * 2;
                shape.vy -= ny * 2;

                player.health -= 1.5;
                shape.health -= 2;

                if (shape.health <= 0) {
                    player.score += shape.points;
                    const newLevel = Math.floor(player.score / 100) + 1;
                    if (newLevel > player.level) {
                        player.skillPoints += (newLevel - player.level);
                        player.level = newLevel;
                    }
                    shapes.splice(j, 1);
                }

                if (player.health <= 0) {
                    respawnPlayer(player);
                }
            }
        }
    }

    spawnShapes();

    // 4. Broadcast state
    const playerStates = Array.from(players.values()).map(p => ({
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        angle: p.angle,
        score: p.score,
        level: p.level,
        skillPoints: p.skillPoints,
        health: p.health,
        maxHealth: p.maxHealth,
        stats: p.stats
    }));

    const payload = JSON.stringify({ 
        type: 'STATE_UPDATE', 
        players: playerStates,
        bullets: bullets.map(b => ({ id: b.id, x: b.x, y: b.y })),
        shapes: shapes.map(s => ({ id: s.id, type: s.type, x: s.x, y: s.y, health: s.health, maxHealth: s.maxHealth, radius: s.radius }))
    });

    for (const player of players.values()) {
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(payload);
        }
    }
}, 1000 / 30);