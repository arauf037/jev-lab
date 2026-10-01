"use client";

interface GameCanvasProps {
  canvasRef: React.Ref<HTMLCanvasElement>;
  onFlap: () => void;
}

export function GameCanvas({ canvasRef, onFlap }: GameCanvasProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950 shadow-[0_0_40px_rgba(34,211,238,0.12)]">
      <canvas
        ref={canvasRef}
        className="block w-full touch-manipulation"
        onClick={onFlap}
        onTouchStart={(e) => {
          e.preventDefault();
          onFlap();
        }}
      />
    </div>
  );
}
