"use client";

import { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import { Image as KonvaImage, Layer, Stage, Transformer } from "react-konva";
import { clampPosition, MAX_SCALE, MIN_SCALE, type Placement } from "@/lib/outfits";

function useLoadedImage(src: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return;
    const element = new window.Image();
    element.crossOrigin = "anonymous";
    element.onload = () => setImage(element);
    element.src = src;
  }, [src]);
  return image;
}

interface PieceProps {
  placement: Placement;
  src: string | null;
  canvasWidth: number;
  onSelect: () => void;
  onChange: (change: Partial<Placement>) => void;
}

function Piece({ placement, src, canvasWidth, onSelect, onChange }: PieceProps) {
  const image = useLoadedImage(src);
  if (!image) return null;

  const canvasHeight = canvasWidth * (4 / 3);
  const width = placement.scale * canvasWidth;
  const height = width * (image.naturalHeight / Math.max(1, image.naturalWidth));

  return (
    <KonvaImage
      id={placement.item_id}
      image={image}
      x={placement.x * canvasWidth}
      y={placement.y * canvasHeight}
      width={width}
      height={height}
      offsetX={width / 2}
      offsetY={height / 2}
      rotation={placement.rotation}
      draggable
      onMouseDown={onSelect}
      onTouchStart={onSelect}
      onDragEnd={(e) => {
        const next = clampPosition({ x: e.target.x() / canvasWidth, y: e.target.y() / canvasHeight });
        // Snap back on screen too, in case the clamp moved it.
        e.target.position({ x: next.x * canvasWidth, y: next.y * canvasHeight });
        onChange(next);
      }}
      onTransformEnd={(e) => {
        const node = e.target;
        const factor = node.scaleX();
        // Konva scales the node. Store it as a width instead, and reset the node's scale.
        node.scaleX(1);
        node.scaleY(1);
        // Resizing from a corner also moves the centre, so save the position as well.
        onChange({
          scale: placement.scale * factor,
          rotation: node.rotation(),
          ...clampPosition({ x: node.x() / canvasWidth, y: node.y() / canvasHeight }),
        });
      }}
    />
  );
}

interface Props {
  placements: Placement[];
  imageFor: (itemId: string) => string | null;
  selectedId: string | null;
  onSelect: (itemId: string | null) => void;
  onChange: (itemId: string, change: Partial<Placement>) => void;
}

export default function OutfitCanvas({ placements, imageFor, selectedId, onSelect, onChange }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const transformer = useRef<Konva.Transformer>(null);
  const stage = useRef<Konva.Stage>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!wrapper.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(wrapper.current);
    return () => observer.disconnect();
  }, []);

  // Attach handles to the selected piece. This runs after every render so it also
  // catches a piece whose image has only just loaded.
  useEffect(() => {
    const node = selectedId ? stage.current?.findOne((n: Konva.Node) => n.id() === selectedId) : null;
    transformer.current?.nodes(node ? [node] : []);
    transformer.current?.getLayer()?.batchDraw();
  });

  const ordered = [...placements].sort((a, b) => a.z_index - b.z_index);

  return (
    <div ref={wrapper} className="aspect-[3/4] w-full touch-none overflow-hidden rounded-lg bg-[#d4d4d4]">
      {width > 0 && (
        <Stage
          ref={stage}
          width={width}
          height={width * (4 / 3)}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) onSelect(null);
          }}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage()) onSelect(null);
          }}
        >
          <Layer>
            {ordered.map((placement) => (
              <Piece
                key={placement.item_id}
                placement={placement}
                src={imageFor(placement.item_id)}
                canvasWidth={width}
                onSelect={() => onSelect(placement.item_id)}
                onChange={(change) => onChange(placement.item_id, change)}
              />
            ))}
            <Transformer
              ref={transformer}
              keepRatio
              rotateEnabled
              rotationSnaps={[0, 90, 180, 270]}
              rotationSnapTolerance={4}
              enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
              anchorSize={14}
              anchorCornerRadius={7}
              anchorStroke="#0a0a0a"
              anchorFill="#ffffff"
              borderStroke="#0a0a0a"
              rotateAnchorOffset={28}
              boundBoxFunc={(oldBox, newBox) => {
                const ratio = Math.abs(newBox.width) / width;
                return ratio < MIN_SCALE || ratio > MAX_SCALE ? oldBox : newBox;
              }}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
}
