"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/opportunities", label: "Opportunities" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/followups", label: "Follow-ups" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api.post("/api/auth/logout");
    router.push("/login");
  }

  if (pathname.startsWith("/login")) return null;

  return (
    <nav className="w-56 shrink-0 border-r border-slate-200 bg-white h-screen sticky top-0 flex flex-col">
      <div className="px-4 py-5 border-b border-slate-100">
        <div className="font-semibold text-slate-900">Creator Outreach</div>
        <div className="text-xs text-slate-500">CRM &amp; automation</div>
      </div>
      <div className="flex-1 py-4 px-2 space-y-1">
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
      <div className="p-4 border-t border-slate-100">
        <button className="btn-secondary w-full" onClick={logout}>
          Log out
        </button>
      </div>
    </nav>
  );
}
