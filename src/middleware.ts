import { auth as middleware } from "@/auth"

export default middleware((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  const isApiRoute = pathname.startsWith("/api/")
  const isPublicApi =
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/webhooks/")

  if (isApiRoute && !isPublicApi && !isLoggedIn) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    )
  }

  if (pathname.startsWith("/admin") && !isLoggedIn) {
    return Response.redirect(new URL("/login", req.nextUrl))
  }
})

export const config = {
  matcher: ["/admin/:path*", "/api/:path*", "/login"],
}
