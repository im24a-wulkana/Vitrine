import { notFound } from "next/navigation";
import { ItemForm } from "@/components/item-form";
import { PhotoManager } from "@/components/photo-manager";
import { rankBrands } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { InventoryItem } from "@/lib/types";

export const metadata = { title: "Edit item" };

export default async function EditItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photos_failed?: string }>;
}) {
  const { id } = await params;
  const { photos_failed: photosFailed } = await searchParams;
  const { db } = await requireUser();
  const [{ data }, { data: rows }] = await Promise.all([
    db.from("items").select("*, item_images(*)").eq("id", id).maybeSingle(),
    db.from("items").select("brand").limit(5000),
  ]);
  if (!data) notFound();
  const item = data as InventoryItem;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <h1 className="page-title">Edit item</h1>
      {photosFailed && (
        <p role="alert" className="border border-foreground px-3 py-2 text-sm font-medium">
          The item was saved, but {photosFailed} photo(s) failed to upload. Add them again below.
        </p>
      )}
      <PhotoManager itemId={item.id} images={item.item_images} />
      <ItemForm brands={rankBrands(rows ?? [])} platforms={[]} defaultCurrency={item.buy_currency} item={item} />
    </div>
  );
}
