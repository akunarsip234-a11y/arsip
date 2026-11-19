import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ambilInstansi } from "@/lib/data";
import { petaNomorItem } from "@/lib/types";
import { createSignedDownloadUrl } from "@/lib/storage";
import { bolehKelola, sesiPengguna, tulisLog } from "@/lib/actions/guard";
import { ForbiddenError, ValidationError, withApiErrorHandling } from "@/lib/errors";
import { buatBerkasEkspor } from "@/lib/ekspor";
import { FORMAT_EKSPOR, JENIS_EKSPOR, type SumberEkspor } from "@/lib/ekspor/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATAS_BARIS = 5000;

const skema = z.object({
  jenis: z.enum(JENIS_EKSPOR),
  format: z.enum(FORMAT_EKSPOR),
  ids: z.array(z.string().min(1)).min(1).max(BATAS_BARIS),
});

async function ambilLogo(path: string | undefined) {
  if (!path) return null;
  try {
    const url = await createSignedDownloadUrl(path, 60);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    return { data, type: path.toLowerCase().endsWith(".png") ? ("png" as const) : ("jpeg" as const) };
  } catch {
    return null;
  }
}

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const aktor = await sesiPengguna();
  if (!bolehKelola(aktor)) {
    throw new ForbiddenError("Hanya Admin dan Operator yang dapat mengekspor.");
  }

  const parsed = skema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw new ValidationError("Permintaan ekspor tidak valid.");
  }

  const { jenis, format } = parsed.data;
  const ids = Array.from(new Set(parsed.data.ids));

  const daftar = await prisma.arsip.findMany({
    where: { id: { in: ids }, deleted_at: null },
    include: { kode_arsip: true },
    orderBy: [{ tanggal_arsip: "asc" }, { nomor_arsip: "asc" }],
  });

  if (!daftar.length) {
    throw new ValidationError("Tidak ada data untuk diekspor.");
  }

const jumlahItem = new Map<string, number>();
for (const item of daftar) {
  const kunci = item.nomor_berkas?.trim();
  if (!kunci) continue;
  jumlahItem.set(kunci, (jumlahItem.get(kunci) ?? 0) + 1);
}

const semuaArsip = await prisma.arsip.findMany({
  where: { deleted_at: null },
  select: { id: true, folder_id: true, tanggal_arsip: true, nomor_arsip: true },
});
const nomorItem = petaNomorItem(semuaArsip);

const arsip: SumberEkspor[] = daftar.map((item) => ({
  id: item.id,
  nomor_arsip: item.nomor_arsip,
  judul: item.judul,
  kode: item.kode_arsip.kode,
  tanggal_arsip: item.tanggal_arsip,
  keterangan: item.keterangan,
  nomor_berkas: item.nomor_berkas,
  nomor_item: nomorItem.get(item.id)?.toString() ?? null,
  indeks: item.indeks,
  jumlah_folder: item.jumlah_folder,
  tingkat_perkembangan: item.tingkat_perkembangan,
  jumlah_halaman: item.jumlah_halaman,
  sifat_arsip: item.sifat_arsip,
  lokasi_cabinet: item.lokasi_cabinet,
  lokasi_laci: item.lokasi_laci,
  lokasi_folder: item.lokasi_folder,
  kurun_waktu: item.kurun_waktu,
  nomor_boks: item.nomor_boks,
}));

const instansi = await ambilInstansi(aktor.id);
const logo = await ambilLogo(instansi.logo_path);

const berkas = await buatBerkasEkspor(jenis, format, arsip, instansi, { logo, jumlahItem });

await tulisLog(
  prisma,
  aktor,
  "Ekspor Arsip",
  `Mengekspor ${arsip.length} arsip (${jenis}, ${format.toUpperCase()}).`,
  "ekspor",
  { type: "ekspor", data: { jenis, format, jumlah: arsip.length } },
);

return new NextResponse(new Uint8Array(berkas.buffer), {
  status: 200,
  headers: {
    "Content-Type": berkas.contentType,
    "Content-Disposition": `attachment; filename="${berkas.filename}"`,
    "Cache-Control": "no-store",
  },
});
});
