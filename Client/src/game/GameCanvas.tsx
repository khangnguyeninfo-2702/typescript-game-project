import React, { useEffect, useRef, useState } from 'react';

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
    tankType: string;
    radius: number;
    angle: number;
    score: number;
    level: number;
    skillPoints: number;
    health: number;
    maxHealth: number;
    stats: PlayerStats;
}

interface Bullet {
    id: string;
    x: number;
    y: number;
}

interface Shape {
    id: string;
    type: 'square' | 'triangle' | 'pentagon';
    x: number;
    y: number;
    health: number;
    maxHealth: number;
    radius: number;
}

const MAP_SIZE = 3000;
const DEBUG_SKIP_MENU = false;
const TANK_BARRELS: Record<string, { angle: number; offset: number }[]> = {
    basic: [{ angle: 0, offset: 0 }],
    twin:  [{ angle: 0, offset: 0.45 }, { angle: 0, offset: -0.45 }],
    flank: [{ angle: 0, offset: 0 }, { angle: Math.PI, offset: 0 }],
};
const classBtnStyle: React.CSSProperties = {
    background: '#333',
    color: '#fff',
    border: '1px solid #666',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold'
};

export const GameCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const minimapRef = useRef<HTMLCanvasElement | null>(null);
    const myIdRef = useRef<string | null>(null);
    const playersRef = useRef<Map<string, Player>>(new Map());
    const bulletsRef = useRef<Bullet[]>([]);
    const shapesRef = useRef<Shape[]>([]);
    const keysRef = useRef({ w: false, a: false, s: false, d: false });
    const mouseRef = useRef({ x: 0, y: 0 });
    const wsRef = useRef<WebSocket | null>(null);

    // Combat timing & recoil refs
    const lastShootTimeRef = useRef<number>(0);
    const recoilOffsetRef = useRef<number>(0);

    const [myPlayer, setMyPlayer] = useState<Player | null>(null);
    const [inMenu, setInMenu] = useState<boolean>(!DEBUG_SKIP_MENU);
    const [nameInput, setNameInput] = useState<string>('TestTank');
    const pendingNameRef = useRef<string | null>(DEBUG_SKIP_MENU ? 'TestTank' : null);

    // Single unified WebSocket connection setup
    useEffect(() => {
        const canvas = canvasRef.current;
        const minimapCanvas = minimapRef.current;
        if (!canvas || !minimapCanvas) return;
        
        const ctx = canvas.getContext('2d');
        const miniCtx = minimapCanvas.getContext('2d');
        if (!ctx || !miniCtx) return;

        let animationFrameId: number;

        console.log('[CLIENT] Initializing WebSocket connection to ws://localhost:8080...');
        const ws = new WebSocket('ws://localhost:8080');
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('[CLIENT] WebSocket connected successfully!');
            if (pendingNameRef.current) {
                console.log('[CLIENT] Sending queued join request for:', pendingNameRef.current);
                ws.send(JSON.stringify({ type: 'JOIN_GAME', name: pendingNameRef.current }));
                pendingNameRef.current = null;
            } else if (DEBUG_SKIP_MENU) {
                ws.send(JSON.stringify({ type: 'JOIN_GAME', name: 'TestTank' }));
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'INIT') {
                    myIdRef.current = data.id;
                    console.log('[CLIENT] Received INIT ID:', data.id);
                } 
                else if (data.type === 'STATE_UPDATE') {
                    playersRef.current.clear();
                    if (data.players) {
                        data.players.forEach((p: Player) => {
                            playersRef.current.set(p.id, p);
                            if (p.id === myIdRef.current) {
                                setMyPlayer({ ...p });
                                if (p.x < 0) {
                                    setInMenu(true);
                                }
                            }
                        });
                    }
                    bulletsRef.current = data.bullets || [];
                    shapesRef.current = data.shapes || [];
                }
            } catch (err) {
                console.error('Failed to parse message', err);
            }
        };

        ws.onerror = (err) => {
            console.error('[CLIENT] WebSocket error:', err);
        };

        ws.onclose = () => {
            console.log('[CLIENT] WebSocket closed.');
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (key in keysRef.current) keysRef.current[key as keyof typeof keysRef.current] = true;
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (key in keysRef.current) keysRef.current[key as keyof typeof keysRef.current] = false;
        };

        const handleMouseMove = (e: MouseEvent) => {
            mouseRef.current.x = e.clientX;
            mouseRef.current.y = e.clientY;
        };

        const handleMouseDown = (e: MouseEvent) => {
            if (e.button === 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                const now = performance.now();
                const me = myIdRef.current ? playersRef.current.get(myIdRef.current) : null;
                
                const reloadBonus = me ? me.stats.reload * 30 : 0; 
                const fireCooldown = Math.max(80, 300 - reloadBonus);

                if (now - lastShootTimeRef.current >= fireCooldown) {
                    wsRef.current.send(JSON.stringify({ type: 'SHOOT' }));
                    lastShootTimeRef.current = now;
                    recoilOffsetRef.current = 12;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mousedown', handleMouseDown);

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', handleResize);
        handleResize();

        const drawPolygon = (x: number, y: number, radius: number, sides: number, fillColor: string, strokeColor: string) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.beginPath();
            for (let i = 0; i < sides; i++) {
                const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
                const px = radius * Math.cos(angle);
                const py = radius * Math.sin(angle);
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = strokeColor;
            ctx.stroke();
            ctx.restore();
        };

        let lastSendTime = 0;
        const render = (time: number) => {
            if (time - lastSendTime > 30 && ws.readyState === WebSocket.OPEN) {
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const angle = Math.atan2(mouseRef.current.y - centerY, mouseRef.current.x - centerX);

                ws.send(JSON.stringify({ type: 'INPUT', keys: keysRef.current, angle }));
                lastSendTime = time;
            }

            if (recoilOffsetRef.current > 0.1) {
                recoilOffsetRef.current *= 0.82;
            } else {
                recoilOffsetRef.current = 0;
            }

            const myId = myIdRef.current;
            const me = myId ? playersRef.current.get(myId) : null;
            
            const cameraX = me && me.x > 0 ? me.x - canvas.width / 2 : 1500 - canvas.width / 2;
            const cameraY = me && me.y > 0 ? me.y - canvas.height / 2 : 1500 - canvas.height / 2;

            ctx.fillStyle = '#212121';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = '#2b2b2b';
            ctx.lineWidth = 1;
            const gridSize = 40;

            const startX = - (cameraX % gridSize);
            for (let x = startX; x < canvas.width; x += gridSize) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }

            const startY = - (cameraY % gridSize);
            for (let y = startY; y < canvas.height; y += gridSize) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
            }

            shapesRef.current.forEach((shape) => {
                const screenX = shape.x - cameraX;
                const screenY = shape.y - cameraY;
                if (screenX >= -50 && screenX <= canvas.width + 50 && screenY >= -50 && screenY <= canvas.height + 50) {
                    if (shape.type === 'square') drawPolygon(screenX, screenY, shape.radius, 4, '#ffe869', '#cfae32');
                    else if (shape.type === 'triangle') drawPolygon(screenX, screenY, shape.radius, 3, '#fc7677', '#c24243');
                    else if (shape.type === 'pentagon') drawPolygon(screenX, screenY, shape.radius, 5, '#768dfc', '#435ac2');
                }
            });

            ctx.fillStyle = '#f14e54';
            bulletsRef.current.forEach((bullet) => {
                const screenX = bullet.x - cameraX;
                const screenY = bullet.y - cameraY;
                ctx.beginPath();
                ctx.arc(screenX, screenY, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#222222';
                ctx.stroke();
                ctx.closePath();
            });

            // Render Players & Health Bars
            playersRef.current.forEach((player) => {
                if (player.x < 0) return;

                const r = player.radius || 20;
                const isMe = player.id === myIdRef.current;
                const screenX = player.x - cameraX;
                const screenY = player.y - cameraY;

                ctx.save();
                if (isMe && recoilOffsetRef.current > 0) {
                    const kickX = -Math.cos(player.angle) * recoilOffsetRef.current;
                    const kickY = -Math.sin(player.angle) * recoilOffsetRef.current;
                    ctx.translate(screenX + kickX, screenY + kickY);
                } else {
                    ctx.translate(screenX, screenY);
                }

                ctx.rotate(player.angle);
                ctx.fillStyle = '#999999';
                const barrels = TANK_BARRELS[player.tankType] || TANK_BARRELS.basic;
                const barrelW = player.tankType === 'twin' ? r * 0.5 : r * 0.8;
                barrels.forEach((b) => {
                    ctx.save();
                    ctx.rotate(b.angle);
                    ctx.fillRect(0, b.offset * r - barrelW / 2, r * 1.5, barrelW);
                    ctx.restore();
                });
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);               // body scales with size
                ctx.fillStyle = isMe ? '#00b2e1' : '#f14e54';
                ctx.fill();
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#222222';
                ctx.stroke();
                ctx.closePath();
                ctx.restore();

                const barWidth = r * 2;
                const barHeight = 6;
                const barY = screenY + r + 8;
                const maxH = player.maxHealth || 100;
                const healthPercent = Math.max(0, player.health / maxH);

                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(screenX - barWidth / 2, barY, barWidth, barHeight);

                ctx.fillStyle = '#85e37d';
                ctx.fillRect(screenX - barWidth / 2, barY, barWidth * healthPercent, barHeight);

                ctx.strokeStyle = '#222222';
                ctx.lineWidth = 1;
                ctx.strokeRect(screenX - barWidth / 2, barY, barWidth, barHeight);

                ctx.fillStyle = '#ffffff';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`${player.name || 'Tanker'} (Lvl ${player.level || 1})`, screenX, screenY - r - 10);
            });

            const miniWidth = minimapCanvas.width;
            const miniHeight = minimapCanvas.height;
            const scaleX = miniWidth / MAP_SIZE;
            const scaleY = miniHeight / MAP_SIZE;

            miniCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            miniCtx.fillRect(0, 0, miniWidth, miniHeight);

            miniCtx.strokeStyle = '#555';
            miniCtx.lineWidth = 2;
            miniCtx.strokeRect(0, 0, miniWidth, miniHeight);

            shapesRef.current.forEach((shape) => {
                const mapX = shape.x * scaleX;
                const mapY = shape.y * scaleY;
                miniCtx.beginPath();
                if (shape.type === 'square') {
                    miniCtx.fillStyle = '#ffe869';
                    miniCtx.fillRect(mapX - 1.5, mapY - 1.5, 3, 3);
                } else if (shape.type === 'triangle') {
                    miniCtx.fillStyle = '#fc7677';
                    miniCtx.arc(mapX, mapY, 1.5, 0, Math.PI * 2);
                    miniCtx.fill();
                } else {
                    miniCtx.fillStyle = '#768dfc';
                    miniCtx.arc(mapX, mapY, 2, 0, Math.PI * 2);
                    miniCtx.fill();
                }
            });

            playersRef.current.forEach((player) => {
                if (player.x < 0) return;
                const isMe = player.id === myIdRef.current;
                const mapX = player.x * scaleX;
                const mapY = player.y * scaleY;

                miniCtx.beginPath();
                miniCtx.arc(mapX, mapY, isMe ? 4 : 3, 0, Math.PI * 2);
                miniCtx.fillStyle = isMe ? '#00b2e1' : '#f14e54';
                miniCtx.fill();
            });

            animationFrameId = requestAnimationFrame(render);
        };

        animationFrameId = requestAnimationFrame(render);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
            ws.close();
        };
    }, []);

    const joinGame = (e: React.FormEvent) => {
        e.preventDefault();
        setInMenu(false);

        const ws = wsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'JOIN_GAME', name: nameInput }));
        } else {
            pendingNameRef.current = nameInput;
        }
    };

    const upgradeStat = (statName: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'UPGRADE_STAT', stat: statName }));
        }
    };

    const chooseClass = (tankType: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'CHOOSE_CLASS', tankType }));
        }
    };

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', background: '#212121' }} />

            {/* Menu Overlay */}
            {inMenu && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(0, 0, 0, 0.75)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 10
                }}>
                    <form onSubmit={joinGame} style={{
                        background: '#2b2b2b',
                        padding: '30px',
                        borderRadius: '10px',
                        border: '2px solid #444',
                        textAlign: 'center',
                        color: '#fff',
                        fontFamily: 'Arial, sans-serif',
                        width: '320px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
                    }}>
                        <h2 style={{ marginBottom: '15px', color: '#00b2e1' }}>DIEP.IO CLONE</h2>
                        
                        <div style={{ marginBottom: '15px', fontSize: '14px', color: '#ffcc00' }}>
                            Respawn Level: <strong>{myPlayer ? myPlayer.level : 1}</strong>
                        </div>

                        <input 
                            type="text" 
                            value={nameInput} 
                            onChange={(e) => setNameInput(e.target.value)} 
                            placeholder="Enter Name"
                            maxLength={15}
                            style={{
                                width: '100%',
                                padding: '10px',
                                marginBottom: '15px',
                                borderRadius: '5px',
                                border: '1px solid #555',
                                background: '#1c1c1c',
                                color: '#fff',
                                fontSize: '16px',
                                textAlign: 'center',
                                outline: 'none'
                            }}
                        />

                        <button 
                            type="submit" 
                            style={{
                                width: '100%',
                                padding: '10px',
                                background: '#00b2e1',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '5px',
                                fontSize: '16px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            Play / Respawn
                        </button>
                    </form>
                </div>
            )}

            {/* Minimap */}
            <canvas
                ref={minimapRef}
                width={150}
                height={150}
                style={{
                    display: inMenu ? 'none' : 'block',
                    position: 'absolute',
                    bottom: '20px',
                    right: '20px',
                    borderRadius: '6px',
                    border: '2px solid #444',
                    background: 'rgba(20, 20, 20, 0.6)'
                }}
            />
            {/* Class Selection (level 5+) */}
            {!inMenu && myPlayer && myPlayer.level >= 5 && myPlayer.tankType === 'basic' && (
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(0, 0, 0, 0.7)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '2px solid #444',
                    color: '#fff',
                    fontFamily: 'Arial, sans-serif',
                    textAlign: 'center'
                }}>
                    <div style={{ marginBottom: '8px', fontWeight: 'bold', color: '#ffcc00' }}>
                        Choose your class
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => chooseClass('twin')} style={classBtnStyle}>Twin</button>
                        <button onClick={() => chooseClass('flank')} style={classBtnStyle}>Flank</button>
                    </div>
                </div>
            )}
            {/* Upgrade Menu */}
            {!inMenu && myPlayer && myPlayer.skillPoints > 0 && (
                <div style={{
                    position: 'absolute',
                    bottom: '20px',
                    left: '20px',
                    background: 'rgba(0, 0, 0, 0.7)',
                    padding: '12px',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: '14px',
                    border: '2px solid #444'
                }}>
                    <div style={{ marginBottom: '8px', fontWeight: 'bold', color: '#ffcc00' }}>
                        ★ Upgrade Points: {myPlayer.skillPoints}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {[
                            { key: 'maxHealth', label: 'Max Health', val: myPlayer.stats.maxHealth },
                            { key: 'bulletDamage', label: 'Bullet Damage', val: myPlayer.stats.bulletDamage },
                            { key: 'bulletSpeed', label: 'Bullet Speed', val: myPlayer.stats.bulletSpeed },
                            { key: 'reload', label: 'Attack Speed (Reload)', val: myPlayer.stats.reload },
                            { key: 'movementSpeed', label: 'Movement Speed', val: myPlayer.stats.movementSpeed },
                        ].map((stat) => (
                            <button
                                key={stat.key}
                                onClick={() => upgradeStat(stat.key)}
                                style={{
                                    background: '#333',
                                    color: '#fff',
                                    border: '1px solid #666',
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    display: 'flex',
                                    justifyContent: 'space-between'
                                }}
                            >
                                <span>{stat.label}</span>
                                <span style={{ color: '#00b2e1', fontWeight: 'bold' }}>[{stat.val}/7] +</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};