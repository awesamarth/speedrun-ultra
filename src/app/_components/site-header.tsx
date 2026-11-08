"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="wordmark" aria-label="speedrun-ultra home">speedrun<span>-ultra</span></Link>
        <nav aria-label="Main navigation" className="site-nav">
          {[["/", "Home"], ["/health", "Data health"], ["/method", "Method"]].map(([href, text]) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{text}</Link>
          ))}
          <a href="/llms.txt">llms.txt <span aria-hidden="true">↗</span></a>
        </nav>
      </div>
    </header>
  );
}
