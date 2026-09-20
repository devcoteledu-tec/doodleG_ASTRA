 'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-lg p-8 text-center"><h1 className="text-2xl font-semibold">Something went wrong</h1><p className="my-4">Please try again. If you already paid, check your order history before paying again.</p><button className="rounded bg-black px-5 py-3 text-white" onClick={reset}>Try again</button></main>;
}
