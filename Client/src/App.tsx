import React from 'react';
import { GameCanvas } from './game/GameCanvas';

function App() {
  return (
    <div style={{ margin: 0, overflow: 'hidden', height: '100vh', width: '100vw' }}>
      <GameCanvas />
    </div>
  );
}

export default App;