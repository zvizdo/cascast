import { notFound } from "next/navigation";
import { MountainHeader } from "@/components/mountain/MountainHeader";
import { MountainDetail } from "@/components/mountain/MountainDetail";
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
  // An absent ?target means the client defaults to tomorrow (MountainDetail computes it).
  const { target } = await searchParams;
  const mountain = MOUNTAINS.find((m) => m.slug === slug) as Mountain | undefined;
  if (!mountain) notFound();

  return (
    <>
      <MountainHeader mountain={mountain} target={target} />
      <MountainDetail mountain={mountain} target={target} />
    </>
  );
}
