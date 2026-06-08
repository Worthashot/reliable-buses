import { useState, useRef } from 'react';




interface Props {
  imageSrc: string;
}

interface PanOffset {
  x: number;
  y: number;
}

function ImageViewer({ imageSrc }: Props) {
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    setPanOffset(prev => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }));
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => setDragging(false);

  if (!imageSrc) return <p>No image to display.</p>;

  return (
    <div
      style={{
        width: '1200px',
        height: '400px',
        overflow: 'hidden',
        border: '1px solid #ccc',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <img
        src={imageSrc}
        alt="Large pannable"
        draggable={false}
        style={{
          transform: `translate(${panOffset.x}px)`,
          pointerEvents: 'none',  // so mouse events only go to the div
        }}
      />
    </div>
  );
}

export default ImageViewer;