import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  subContent?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ 
  children, 
  content, 
  subContent,
  position = 'top' 
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div 
      className="relative inline-block w-full"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: position === 'top' ? 5 : -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: position === 'top' ? 5 : -5 }}
            className={`absolute z-[100] ${positionClasses[position]} pointer-events-none`}
          >
            <div className="bg-black/90 border border-eve-accent/40 p-3 shadow-[0_0_20px_rgba(0,0,0,0.8)] min-w-[200px] backdrop-blur-sm">
              <div className="text-[10px] font-bold uppercase tracking-widest text-eve-accent mb-1 border-b border-eve-accent/20 pb-1">
                Tactical Intel
              </div>
              <div className="text-[11px] text-white/90 font-mono leading-relaxed">
                {content}
              </div>
              {subContent && (
                <div className="mt-2 pt-1 border-t border-white/10 text-[9px] text-eve-warning uppercase font-bold">
                  {subContent}
                </div>
              )}
              {/* Corner Accents */}
              <div className="absolute top-0 left-0 w-1 h-1 border-t border-l border-eve-accent" />
              <div className="absolute top-0 right-0 w-1 h-1 border-t border-r border-eve-accent" />
              <div className="absolute bottom-0 left-0 w-1 h-1 border-b border-l border-eve-accent" />
              <div className="absolute bottom-0 right-0 w-1 h-1 border-b border-r border-eve-accent" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
