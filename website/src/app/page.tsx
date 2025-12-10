import { Icon } from '@iconify/react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <section className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="mb-4 flex items-center gap-2 rounded-full border bg-fd-secondary/50 px-4 py-1.5 text-sm">
          <Icon icon="lucide:zap" className="size-4 text-yellow-500" />
          <span>220k+ requests/second with native Rust</span>
        </div>

        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
            Gust
          </span>
        </h1>

        <p className="mb-2 text-xl text-fd-muted-foreground sm:text-2xl">
          High-Performance HTTP Server Framework
        </p>

        <p className="mb-8 max-w-2xl text-fd-muted-foreground">
          For Bun and Node.js. Native Rust acceleration, portable apps for
          serverless/edge, and batteries-included middleware.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-lg bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
          >
            <Icon icon="lucide:book-open" className="size-5" />
            Get Started
          </Link>
          <Link
            href="https://github.com/SylphxAI/gust"
            className="inline-flex items-center gap-2 rounded-lg border bg-fd-background px-6 py-3 font-medium transition-colors hover:bg-fd-secondary"
          >
            <Icon icon="lucide:github" className="size-5" />
            GitHub
          </Link>
        </div>

        {/* Quick Install */}
        <div className="mt-8 rounded-lg border bg-fd-card p-4">
          <code className="text-sm text-fd-muted-foreground">
            bun add @sylphx/gust
          </code>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-fd-secondary/30 px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-3xl font-bold">
            Why Gust?
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            <FeatureCard
              icon="lucide:cpu"
              title="Native Performance"
              description="Rust-powered with Hyper + Tokio via napi-rs. io_uring on Linux for maximum throughput."
            />
            <FeatureCard
              icon="lucide:globe"
              title="Portable Apps"
              description="Same code on Bun, Deno, Cloudflare Workers, AWS Lambda, and Vercel Edge."
            />
            <FeatureCard
              icon="lucide:package"
              title="Batteries Included"
              description="20+ middleware: auth (JWT, session), validation, rate limiting, CORS, and more."
            />
            <FeatureCard
              icon="lucide:wifi"
              title="Real-time Ready"
              description="Native WebSocket, SSE with backpressure, and HTTP/2 with server push."
            />
            <FeatureCard
              icon="lucide:shield"
              title="Production Ready"
              description="Health checks, circuit breakers, OpenTelemetry tracing, and graceful shutdown."
            />
            <FeatureCard
              icon="lucide:code"
              title="Type-Safe"
              description="Full TypeScript support with path parameter inference and validated schemas."
            />
          </div>
        </div>
      </section>

      {/* Code Example */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-8 text-center text-3xl font-bold">
            Simple by Default
          </h2>
          <div className="overflow-hidden rounded-lg border bg-fd-card">
            <div className="flex items-center gap-2 border-b bg-fd-secondary/50 px-4 py-2">
              <div className="size-3 rounded-full bg-red-500" />
              <div className="size-3 rounded-full bg-yellow-500" />
              <div className="size-3 rounded-full bg-green-500" />
              <span className="ml-2 text-sm text-fd-muted-foreground">
                server.ts
              </span>
            </div>
            <pre className="overflow-x-auto p-4 text-sm">
              <code>{`import { createApp, serve, get, json, cors } from '@sylphx/gust'

const app = createApp({
  routes: [
    get('/', () => json({ message: 'Hello World!' })),
    get('/users/:id', ({ ctx }) => json({ id: ctx.params.id })),
  ],
  middleware: cors(),
})

await serve({ app, port: 3000 })
// Server running at http://localhost:3000
// Using native Rust acceleration (220k+ req/s)`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="border-t bg-fd-secondary/30 px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-8 text-center text-3xl font-bold">
            Modular Architecture
          </h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <PackageCard
              name="@sylphx/gust"
              description="Main package, re-exports everything"
              size="~87 B"
            />
            <PackageCard
              name="@sylphx/gust-app"
              description="Portable app framework"
              size="82 KB"
            />
            <PackageCard
              name="@sylphx/gust-server"
              description="Rust-powered HTTP server"
              size="73 KB"
            />
            <PackageCard
              name="@sylphx/gust-core"
              description="WASM router & utilities"
              size="~4 KB"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2 text-fd-muted-foreground">
            <Icon icon="lucide:wind" className="size-5" />
            <span>Built by Sylphx</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="https://github.com/SylphxAI/gust"
              className="text-fd-muted-foreground transition-colors hover:text-fd-foreground"
            >
              <Icon icon="lucide:github" className="size-5" />
            </Link>
            <Link
              href="https://www.npmjs.com/package/@sylphx/gust"
              className="text-fd-muted-foreground transition-colors hover:text-fd-foreground"
            >
              <Icon icon="lucide:package" className="size-5" />
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-fd-card p-6">
      <Icon icon={icon} className="mb-4 size-8 text-fd-primary" />
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-fd-muted-foreground">{description}</p>
    </div>
  );
}

function PackageCard({
  name,
  description,
  size,
}: {
  name: string;
  description: string;
  size: string;
}) {
  return (
    <div className="rounded-lg border bg-fd-card p-4">
      <code className="text-sm font-medium text-fd-primary">{name}</code>
      <p className="mt-2 text-sm text-fd-muted-foreground">{description}</p>
      <p className="mt-2 text-xs text-fd-muted-foreground/70">{size}</p>
    </div>
  );
}
