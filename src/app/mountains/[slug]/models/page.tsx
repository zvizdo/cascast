import { notFound } from "next/navigation";
import { ModelLabClient } from "@/components/modellab/ModelLabClient";
import { MOUNTAINS } from "@/lib/mountains-data";
import type { Mountain } from "@/lib/types";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ target?: string }>;
}) {
  const { slug } = await params;
  const { target } = await searchParams;
  const mountain = MOUNTAINS.find((m) => m.slug === slug) as Mountain | undefined;
  if (!mountain) notFound();

  return (
    <ModelLabClient
      mountain={{ slug: mountain.slug, name: mountain.name, lat: mountain.lat, lng: mountain.lng }}
      target={target}
    />
  );
}
