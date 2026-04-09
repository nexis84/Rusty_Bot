import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface HackingGridProps {
  correctGuesses: number;
  totalNodes: number;
  word: string;
  guessedLetters: string[];
}

export const HackingGrid: React.FC<HackingGridProps> = ({ 
  correctGuesses, 
  word,
  guessedLetters 
}) => {
  const [packets, setPackets] = useState<Array<{id: string; from: number; to: number; progress: number}>>([]);
  
  const wordLength = word.length || 1;
  // Expanded to fill container
  const svgWidth = 800;
  const svgHeight = 500;
  const centerX = svgWidth / 2;
  const startY = 40;
  const endY = svgHeight - 40;
  const rowSpacing = wordLength > 1 ? (endY - startY) / (wordLength - 1) : 0;
  
  // Generate rows based on word length
  const rows = Array.from({ length: wordLength }, (_, i) => ({
    id: i,
    y: startY + i * rowSpacing,
    // Core is at the bottom (last row)
    isCoreRow: i === wordLength - 1
  }));
  
  // Generate nodes for each row (3-5 nodes per row)
  const nodes: Array<{
    id: number;
    x: number;
    y: number;
    row: number;
    isCore: boolean;
  }> = [];
  
  rows.forEach((row, rowIndex) => {
    const nodeCount = row.isCoreRow ? 1 : 3 + (rowIndex % 2); // 3-4 nodes per row, 1 for core
    const nodeSpacing = 100; // Increased node spacing
    const rowWidth = nodeCount * nodeSpacing;
    const startX = centerX - rowWidth / 2 + nodeSpacing / 2;
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        id: nodes.length,
        x: startX + i * nodeSpacing,
        y: row.y,
        row: rowIndex,
        isCore: row.isCoreRow
      });
    }
  });
  
  const coreNode = nodes.find(n => n.isCore);
  
  // Create connections between consecutive rows
  const connections: Array<{from: number; to: number}> = [];
  
  for (let row = 0; row < wordLength - 1; row++) {
    const currentRowNodes = nodes.filter(n => n.row === row);
    const nextRowNodes = nodes.filter(n => n.row === row + 1);
    
    // Connect each node in current row to nearest nodes in next row
    currentRowNodes.forEach((node, i) => {
      const targetIndex = Math.min(i, nextRowNodes.length - 1);
      if (nextRowNodes[targetIndex]) {
        connections.push({ from: node.id, to: nextRowNodes[targetIndex].id });
      }
      // Add diagonal connections
      if (nextRowNodes[targetIndex + 1]) {
        connections.push({ from: node.id, to: nextRowNodes[targetIndex + 1].id });
      }
    });
  }
  
  // Determine exposed nodes - one per row based on correct guesses
  const exposedNodeIds: number[] = [];
  
  for (let row = 0; row < Math.min(correctGuesses, wordLength); row++) {
    const rowNodes = nodes.filter(n => n.row === row && !n.isCore);
    // Light up one node per row (center or based on progress)
    if (rowNodes.length > 0) {
      const nodeIndex = Math.min(row, rowNodes.length - 1);
      exposedNodeIds.push(rowNodes[nodeIndex].id);
    }
  }
  
  // Reveal core when all letters guessed
  const coreRevealed = correctGuesses >= wordLength;
  if (coreRevealed && coreNode) {
    exposedNodeIds.push(coreNode.id);
  }
  
  // Data packets
  useEffect(() => {
    const interval = setInterval(() => {
      // Find exposed connections
      const exposedConns = connections.filter(c => 
        exposedNodeIds.includes(c.from) && (exposedNodeIds.includes(c.to) || nodes.find(n => n.id === c.to)?.isCore)
      );
      
      if (exposedConns.length > 0) {
        const conn = exposedConns[Math.floor(Math.random() * exposedConns.length)];
        setPackets(prev => [...prev.slice(-15), {
          id: Math.random().toString(36).slice(2, 9),
          from: conn.from,
          to: conn.to,
          progress: 0
        }]);
      }
    }, 300);
    
    return () => clearInterval(interval);
  }, [correctGuesses, wordLength]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setPackets(prev => 
        prev.map(p => ({ ...p, progress: p.progress + 0.05 }))
          .filter(p => p.progress < 1)
      );
    }, 30);
    return () => clearInterval(interval);
  }, []);
  
  const wrongGuesses = guessedLetters.filter(l => !word.includes(l)).length;
  const coherence = Math.max(0, 100 - wrongGuesses * 15);
  const virusStrength = Math.min(100, 30 + correctGuesses * 10);
  const sceneScale = 1;

  // Scrolling code column data
  const codeLines = [
    '0xA4F2', '01001101', 'MOV AX,BX', '> PING...', 'SYS_CALL',
    '0xFF00EE', 'DECRYPT()', 'STACK[7]', '> ACK...', 'NOP;NOP;',
    'JMP 0x44', '10110011', 'RET 0x00', 'XOR EAX', '> SCAN..',
    'INT 0x21', 'PUSH EBP', '0xDEAD', 'CMP AL,1', 'LOOP END',
    'MOV SP,0', '11001010', '> REPLY.', 'CALL FAR', '0x7F001',
    'SHL EBX', 'AND 0xFF', 'SUB SP,4', '> EXEC..', 'DB 0x90',
    'LEA SI,X', '0xC0FFEE', 'IRET', 'CLI;STI', '> TRACE.',
    'XCHG AX', '01110101', 'DW 0x100', 'OR BX,CX', 'HLT;NOP',
  ];

  const doubled = [...codeLines, ...codeLines];

  return (
    <div
      className="w-full h-full flex items-center justify-center pointer-events-none overflow-hidden opacity-95"
      style={{ backgroundColor: '#0a0908' }} // Ensure the container has the same background color
    >

      {/* Left scrolling column */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: '10%', height: '100%', zIndex: 1, overflow: 'hidden', opacity: 0.35 }}>
        <motion.div
          style={{ flexShrink: 0 }}
          animate={{ y: ['0%', '-50%'] }}
          transition={{ duration: 18, ease: 'linear', repeat: Infinity }}
        >
          {doubled.map((line, i) => (
            <div key={i} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', color: '#ff6600', lineHeight: '19px', letterSpacing: '0.5px', whiteSpace: 'nowrap', textShadow: '0 0 2px #000, 0 0 6px #ff6600', textAlign: 'left' }}>{line}</div>
          ))}
        </motion.div>
      </div>

      {/* Right scrolling column */}
      <div style={{ position: 'absolute', right: 0, top: 0, width: '10%', height: '100%', zIndex: 1, overflow: 'hidden', opacity: 0.35 }}>
        <motion.div
          style={{ flexShrink: 0 }}
          animate={{ y: ['-50%', '0%'] }}
          transition={{ duration: 14, ease: 'linear', repeat: Infinity }}
        >
          {doubled.map((line, i) => (
            <div key={i} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', color: '#ff6600', lineHeight: '19px', letterSpacing: '0.5px', whiteSpace: 'nowrap', textShadow: '0 0 2px #000, 0 0 6px #ff6600', textAlign: 'right' }}>{line}</div>
          ))}
        </motion.div>
      </div>

      {/* Main SVG */}
      <svg
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
        viewBox="0 0 800 500"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <linearGradient id="lineUnexplored" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#664433" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#886655" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="lineExplored" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#00aaff" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#88ddff" stopOpacity="1" />
          </linearGradient>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00ff88" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#00aa44" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#00ff88" stopOpacity="0" />
          </radialGradient>
        </defs>
        
        <rect width="800" height="500" fill="#0a0908"/>

        {/* Grid lines */}
        <g opacity="0.03">
          {[...Array(25)].map((_, i) => (
            <line key={`h-${i}`} x1="0" y1={i * 20} x2="800" y2={i * 20} stroke="#ff6600" strokeWidth="0.5"/>
          ))}
        </g>

        {/* Connections */}
        <g>
          {connections.map((conn, idx) => {
            const from = nodes.find(n => n.id === conn.from);
            const to = nodes.find(n => n.id === conn.to);
            if (!from || !to) return null;
            
            const isActive = exposedNodeIds.includes(conn.from) && 
                           (exposedNodeIds.includes(conn.to) || to.isCore);
            
            return (
              <line
                key={idx}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={isActive ? "#00aaff" : "#664433"}
                strokeWidth={isActive ? "1.5" : "1"}
                opacity={isActive ? 0.8 : 0.3}
              />
            );
          })}
        </g>
        
        {/* Data packets */}
        <AnimatePresence>
          {packets.map((packet) => {
            const from = nodes.find(n => n.id === packet.from);
            const to = nodes.find(n => n.id === packet.to);
            if (!from || !to) return null;
            
            const x = from.x + (to.x - from.x) * packet.progress;
            const y = from.y + (to.y - from.y) * packet.progress;
            
            return (
              <motion.circle
                key={packet.id}
                cx={x}
                cy={y}
                r="3"
                fill="#00ddff"
                filter="url(#glow)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            );
          })}
        </AnimatePresence>
        
        {/* Core at bottom */}
        {coreNode && (
          <g opacity={coreRevealed ? 1 : 0.2} style={{ transition: 'opacity 0.5s' }}>
            {/* Glow */}
            <circle cx={coreNode.x} cy={coreNode.y} r="26" fill="url(#coreGlow)" opacity="0.7">
              <animate attributeName="r" values="45;55;45" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.5;0.8;0.5" dur="2s" repeatCount="indefinite" />
            </circle>
            {/* Outer ring */}
            <circle cx={coreNode.x} cy={coreNode.y} r="13" fill="none" stroke="#00ff88" strokeWidth="1.5" strokeDasharray="4,3">
              <animateTransform attributeName="transform" type="rotate" from={`0 ${coreNode.x} ${coreNode.y}`} to={`360 ${coreNode.x} ${coreNode.y}`} dur="8s" repeatCount="indefinite" />
            </circle>
            {/* Middle */}
            <circle cx={coreNode.x} cy={coreNode.y} r="9" fill="#0a1a10" stroke="#00ff88" strokeWidth="1.5"/>
            {/* Inner core */}
            <circle cx={coreNode.x} cy={coreNode.y} r="6" fill="#00ff88">
              <animate attributeName="r" values="10;14;10" dur="1.5s" repeatCount="indefinite" />
            </circle>
            {/* Text */}
            <text x={coreNode.x} y={coreNode.y + 3} textAnchor="middle" fill="#000" fontSize="6" fontFamily="monospace" fontWeight="bold">CORE</text>
            {/* Pulse ring */}
            <circle cx={coreNode.x} cy={coreNode.y} r="18" fill="none" stroke="#00ff88" strokeWidth="1" opacity="0.6">
              <animate attributeName="r" values="30;50;30" dur="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0;0.8" dur="1.5s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
        
        {/* Nodes */}
        <g>
          {nodes.filter(n => !n.isCore).map((node) => {
            const isExposed = exposedNodeIds.includes(node.id);
            
            return (
              <g key={node.id}>
                {/* Glow when exposed */}
                {isExposed && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="8"
                    fill="none"
                    stroke="#00aaff"
                    strokeWidth="1.5"
                    opacity="0.6"
                    filter="url(#glow)"
                  />
                )}
                
                {/* Main circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="5"
                  fill={isExposed ? "#0066aa" : "#2a1a10"}
                  stroke={isExposed ? "#00ddff" : "#664433"}
                  strokeWidth={isExposed ? "2" : "1.5"}
                />
                
                {/* Inner symbol */}
                <text x={node.x} y={node.y + 2} textAnchor="middle" fill={isExposed ? "#aaddff" : "#886655"} fontSize="6" fontFamily="monospace">
                  []
                </text>
                
                {/* Pulse effect */}
                {isExposed && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="5"
                    fill="none"
                    stroke="#00ddff"
                    strokeWidth="1"
                    opacity="0.8"
                  >
                    <animate attributeName="r" values="10;18;10" dur="1s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0;0.8" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
        </g>
        
        {/* Virus meter - bottom left */}
        <g transform="translate(70, 420)">
          <circle r="34" fill="none" stroke="#221100" strokeWidth="2"/>
          <circle r="28" fill="none" stroke="#331100" strokeWidth="3"/>
          <circle 
            r="28" 
            fill="none" 
            stroke="#ff4400" 
            strokeWidth="4"
            strokeDasharray={`${coherence * 1.76} 176`}
            strokeDashoffset="0"
            transform="rotate(-90)"
            opacity="0.9"
          />
          <circle r="20" fill="#1a0a05" stroke={virusStrength > 70 ? '#00ff88' : virusStrength > 40 ? '#ff6600' : '#ff2200'} strokeWidth="2"/>
          <text y="5" textAnchor="middle" fill="#ff6600" fontSize="16" fontFamily="monospace">⚡</text>
          <text y="-50" textAnchor="middle" fill={virusStrength > 70 ? '#00ff88' : '#ff6600'} fontSize="12" fontFamily="monospace">STR:{virusStrength}</text>
          <text y="55" textAnchor="middle" fill="#ff4400" fontSize="12" fontFamily="monospace">COH:{coherence}</text>
        </g>
        
        {/* Status text */}
        <text x="20" y="18" fill="#ff6600" fontSize="9" fontFamily="monospace" opacity="0.7">SYS.HACK_v3.1</text>
        <text x="660" y="18" fill="#ff6600" fontSize="9" fontFamily="monospace" textAnchor="end" opacity="0.7">
          {correctGuesses > 0 ? `PROGRESS: ${correctGuesses}/${word.length}` : 'READY'}
        </text>
        
        {/* Core accessed message */}
        {coreRevealed && (
          <motion.text 
            x="400" y="450" 
            textAnchor="middle" 
            fill="#00ff88" 
            fontSize="16" 
            fontFamily="monospace" 
            fontWeight="bold" 
            filter="url(#glow)"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            SYSTEM CORE ACCESSED
          </motion.text>
        )}
      </svg>
    </div>
  );
};
