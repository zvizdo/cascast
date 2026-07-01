import { notFound } from "next/navigation";
import { Explore3D } from "./Explore3D";
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

  return <Explore3D mountain={mountain} target={target} />;
}
