import type { Placement } from "@/lib/outfits";
import { primaryImage } from "@/lib/format";
import { cn } from "@/lib/utils";

type PieceImages = { item_images: { url: string; is_primary: boolean; position: number; cutout_url: string | null }[]; name: string };

/** A saved canvas, drawn with plain elements at any size. Only the editor needs Konva. */
export function CanvasPreview({ items, pieceFor, className }: { items: Placement[]; pieceFor: (itemId: string) => PieceImages | undefined; className?: string }) {
  return (
    <div className={cn("relative aspect-[3/4] overflow-hidden bg-[#d4d4d4]", className)}>
      {[...items]
        .sort((a, b) => a.z_index - b.z_index)
        .map((item) => {
          const piece = pieceFor(item.item_id);
          const shown = primaryImage(piece?.item_images);
          const src = piece?.item_images.find((i) => i.url === shown)?.cutout_url ?? shown;
          if (!src) return null;
          return (
            <img
              key={item.item_id}
              src={src}
              alt={piece?.name ?? ""}
              loading="lazy"
              draggable={false}
              className="absolute max-w-none"
              style={{
                left: `${item.x * 100}%`,
                top: `${item.y * 100}%`,
                width: `${item.scale * 100}%`,
                transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
              }}
            />
          );
        })}
    </div>
  );
}
