import { readFileSync, writeFileSync } from "fs";

const f = "src/app/(dashboard)/chat/page.tsx";
let s = readFileSync(f, "utf8");

// 1. Wrapper bubble jadi flex-col (agar reactions sibling tersusun vertikal)
const oldWrap = '<div className={cn("relative max-w-[70%] md:max-w-[60%]", showActions && "z-10")}>';
const newWrap = '<div className={cn("relative flex flex-col max-w-[70%] md:max-w-[60%]", showActions && "z-10")}>';
if (!s.includes(oldWrap)) throw new Error("WRAP NOT FOUND");
s = s.replace(oldWrap, newWrap);

// 2. Pindahkan blok reactions keluar dari dalam bubble (line-index based)
const lines = s.split("\n");
const cmtIdx = lines.findIndex((l) => l.includes("{/* Reactions — nempel di bawah bubble */}"));
if (cmtIdx === -1) throw new Error("COMMENT NOT FOUND");

const blkStart = cmtIdx + 1; // baris: {!msg.deleted_at && ...
// Cari akhir blok: baris persis "          )}" (10 spasi)
const blkEnd = lines.findIndex((l, i) => i >= blkStart && l === "          )}");
if (blkEnd === -1) throw new Error("BLOCK END NOT FOUND");

// Baris setelah blok harus penutup bubble "        </div>" (8 spasi, exact)
if (lines[blkEnd + 1] !== "        </div>")
  throw new Error("BUBBLE CLOSE MISMATCH: " + JSON.stringify(lines[blkEnd + 1]));

// Blok baru: dedent 2 spasi + ganti className (hapus -mb-1.5, tambah alignment)
const block = lines.slice(blkStart, blkEnd + 1).map((l) => (l.length >= 2 ? l.slice(2) : l));
const clsIdx = block.findIndex((l) => l.includes('className="flex flex-wrap gap-1 -mb-1.5 mt-1"'));
if (clsIdx === -1) throw new Error("CLASS NOT FOUND");
block[clsIdx] =
  '          <div className={cn("flex flex-wrap gap-1 mt-1", isMine ? "justify-end" : "justify-start")}>';

// Hapus blok lama + komentar + baris kosong sebelumnya
let removeStart = cmtIdx - 1;
if (lines[removeStart].trim() !== "") removeStart = cmtIdx;
lines.splice(removeStart, blkEnd + 1 - removeStart);

// Cari penutup bubble pertama SETELAH posisi removal (exact match, hindari substring match)
const bubbleCloseIdx = lines.findIndex((l, i) => i >= removeStart && l === "        </div>");
if (bubbleCloseIdx === -1) throw new Error("BUBBLE CLOSE NOT FOUND AFTER REMOVAL");

// Sisipkan reactions sebagai sibling di bawah bubble
const insert = [
  "",
  "        {/* Reactions — di luar bubble, mengambang di bawahnya (gaya WhatsApp) */}",
  ...block,
];
lines.splice(bubbleCloseIdx + 1, 0, ...insert);

writeFileSync(f, lines.join("\n"));
console.log("PATCH OK");