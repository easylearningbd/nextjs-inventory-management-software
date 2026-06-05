import { auth } from "@/auth";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;

  // Always allow the sign-in page and every Auth.js endpoint
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/api/auth/");

  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL("/", req.url));
  }
});

export const config = {
  matcher: [
    /*
     * Run on every request except:
     *  - Next.js internals (_next/static, _next/image)
     *  - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
