const fs = require("fs");

// Batch 2: Avatar replacements in page files (tasks, users)
const avatarReplacements = [
  {
    file: "src/app/(dashboard)/tasks/page.tsx",
    swaps: [
      [
        '<img src={a.user.avatar_url} alt={a.user?.full_name || ""} className="h-6 w-6 shrink-0 rounded-full border-2 border-background object-cover" referrerPolicy="no-referrer" />',
        '<Avatar src={a.user.avatar_url} name={a.user?.full_name} size={24} className="border-2 border-background" referrerPolicy="no-referrer" />',
      ],
      [
        '<img src={a.user.avatar_url} alt={a.user?.full_name || ""} className="h-6 w-6 shrink-0 rounded-full border-2 border-surface object-cover" referrerPolicy="no-referrer" />',
        '<Avatar src={a.user.avatar_url} name={a.user?.full_name} size={24} className="border-2 border-surface" referrerPolicy="no-referrer" />',
      ],
    ],
  },
  {
    file: "src/app/(dashboard)/users/page.tsx",
    swaps: [
      [
        '<img src={user.avatar_url} alt={user.full_name} className="h-8 w-8 shrink-0 rounded-full object-cover" referrerPolicy="no-referrer" />',
        '<Avatar src={user.avatar_url} name={user.full_name} size={32} referrerPolicy="no-referrer" />',
      ],
    ],
  },
];

for (const r of avatarReplacements) {
  let content = fs.readFileSync(r.file, "utf8");
  let changed = false;
  for (const [from, to] of r.swaps) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      changed = true;
    }
  }
  if (changed && !content.includes("@/components/ui/avatar")) {
    const lines = content.split("\n");
    let lastImport = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("import ")) lastImport = i;
    }
    lines.splice(
      lastImport + 1,
      0,
      'import { Avatar } from "@/components/ui/avatar";'
    );
    content = lines.join("\n");
  }
  fs.writeFileSync(r.file, content);
  console.log("Updated (avatar): " + r.file);
}

// Batch 3: Logo/QR/Avatar images -> next/image (Image component)
const imageReplacements = [
  {
    file: "src/app/(dashboard)/clients/[id]/page.tsx",
    swaps: [
      [
        '<img src={client.logo_url} alt={client.name} className="h-12 w-12 shrink-0 rounded-xl border border-border object-contain sm:h-14 sm:w-14" />',
        "<Image src={client.logo_url!} alt={client.name} width={56} height={56} className=\"h-12 w-12 shrink-0 rounded-xl border border-border object-contain sm:h-14 sm:w-14\" />",
      ],
    ],
  },
  {
    file: "src/app/(dashboard)/clients/page.tsx",
    swaps: [
      [
        '<img src={c.logo_url} alt={c.name} className="h-10 w-10 rounded-lg border border-border object-contain" />',
        "<Image src={c.logo_url!} alt={c.name} width={40} height={40} className=\"h-10 w-10 rounded-lg border border-border object-contain\" />",
      ],
      [
        '<img src={c.logo_url} alt={c.name} className="h-8 w-8 shrink-0 rounded-lg border border-border object-contain" />',
        "<Image src={c.logo_url!} alt={c.name} width={32} height={32} className=\"h-8 w-8 shrink-0 rounded-lg border border-border object-contain\" />",
      ],
      [
        '<img src={form.logo_url} alt="Logo" className="h-14 w-14 rounded-lg border border-border object-contain" />',
        '<Image src={form.logo_url!} alt="Logo" width={56} height={56} className="h-14 w-14 rounded-lg border border-border object-contain" />',
      ],
    ],
  },
  {
    file: "src/app/(dashboard)/settings/profile/page.tsx",
    swaps: [
      [
        '<img src={avatarUrl} alt="Avatar" className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-border" />',
        '<Image src={avatarUrl!} alt="Avatar" width={96} height={96} className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-border" />',
      ],
    ],
  },
  {
    file: "src/app/(dashboard)/settings/security/page.tsx",
    swaps: [
      [
        '<img src={setupQrUrl} alt="QR Code" className="h-48 w-48 rounded-lg border border-border" />',
        '<Image src={setupQrUrl} alt="QR Code" width={192} height={192} className="h-48 w-48 rounded-lg border border-border" />',
      ],
    ],
  },
];

for (const r of imageReplacements) {
  let content = fs.readFileSync(r.file, "utf8");
  let changed = false;
  for (const [from, to] of r.swaps) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      changed = true;
    }
  }
  if (changed && !content.includes('from "next/image"')) {
    const lines = content.split("\n");
    let lastImport = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("import ")) lastImport = i;
    }
    lines.splice(lastImport + 1, 0, 'import Image from "next/image";');
    content = lines.join("\n");
  }
  fs.writeFileSync(r.file, content);
  console.log("Updated (image): " + r.file);
}

console.log("All batches done");