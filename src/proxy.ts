export { proxy } from './middleware/security'

// Next reads `config` via static analysis and can NOT follow a re-export — defining it in
// middleware/security.ts and re-exporting here silently dropped the matcher (the proxy then ran on
// every request, including _next/static). It must live in THIS file.
export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
}
