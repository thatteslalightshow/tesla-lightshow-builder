#!/bin/bash
set -e

echo "📁 Creating folders..."
mkdir -p src/app/api/auth/callback
mkdir -p src/app/api/upload
mkdir -p src/app/api/shows
mkdir -p src/app/api/export
mkdir -p src/app/auth
mkdir -p src/app/builder
mkdir -p src/app/dashboard
mkdir -p public/icons
mkdir -p public/screenshots

echo "📝 Writing config files..."

cat > next.config.mjs << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
};
export default nextConfig;
EOF

cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
EOF

cat > package.json << 'EOF'
{
  "name": "tesla-lightshow-builder",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev":            "next dev",
    "build":          "next build",
    "start":          "next start",
    "lint":           "next lint",
    "type-check":     "tsc --noEmit",
    "cap:sync":       "next build && npx cap sync",
    "cap:ios":        "npm run cap:sync && npx cap open ios",
    "cap:android":    "npm run cap:sync && npx cap open android",
    "security:audit": "npm audit --audit-level=moderate"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "three": "^0.165.0",
    "jszip": "^3.10.1",
    "@supabase/supabase-js": "^2.43.0",
    "@supabase/auth-helpers-nextjs": "^0.10.0",
    "@capacitor/core": "^6.0.0",
    "@capacitor/cli": "^6.0.0",
    "@capacitor/ios": "^6.0.0",
    "@capacitor/android": "^6.0.0",
    "@capacitor/filesystem": "^6.0.0",
    "@capacitor/share": "^6.0.0",
    "@capacitor/push-notifications": "^6.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/three": "^0.165.0",
    "typescript": "^5.4.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0"
  }
}
EOF

echo "📦 Reinstalling dependencies..."
rm -rf node_modules package-lock.json
npm install

echo "🔀 Pushing to GitHub..."
git add .
git commit -m "Complete app: auth, dashboard, builder, API routes, middleware, PWA"
git push origin main

echo ""
echo "✅ Done! Go to Vercel and redeploy."
