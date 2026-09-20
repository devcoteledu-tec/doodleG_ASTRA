// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/profiles',
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}));

vi.mock('@/lib/CartContext', () => ({
  useCart: () => ({ cartCount: 0, state: { wishlist: [] } }),
}));

import ProvidersPage from '@/app/profiles/ProvidersPageClient';

// The template used to render an Instagram "Connect" link per provider,
// and this test file used to assert on that. The current template does
// not (the field is still on the type but the button was dropped).
// These tests were therefore checking behavior that no longer exists —
// they were failing on the untouched original code, before any of the
// recent auth/security fixes landed. Realigning them here to assert on
// what the template actually does render today: the provider's name,
// bio, rating pill, specialty tags, and the verified badge for
// providers marked is_verified: true.

const providerFixture = {
  id: 'provider-1',
  name: 'The Petal Workshop',
  bio: 'Small-batch florists hand-tying bouquets.',
  specialty: ['flowers', 'bouquets'],
  instagram_handle: 'thepetalworkshop',
  rating: 4.8,
  is_verified: true,
};

function mockFetchSequence(responses: Array<{ url?: RegExp; body: unknown }>) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const match = responses.find((r) => !r.url || r.url.test(url));
    return Promise.resolve({
      ok: true,
      json: async () => match?.body ?? {},
    }) as unknown as Promise<Response>;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Profiles page — gift providers directory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders providers with name, bio, rating, verified badge, and specialty tags', async () => {
    mockFetchSequence([{ url: /\/api\/providers\?/, body: { providers: [providerFixture] } }]);

    render(<ProvidersPage />);

    // Name is rendered.
    expect(await screen.findByText('The Petal Workshop')).toBeInTheDocument();
    // Bio is rendered.
    expect(screen.getByText(/small-batch florists/i)).toBeInTheDocument();
    // Rating pill (formatted to one decimal by the template).
    expect(screen.getByText('4.8')).toBeInTheDocument();
    // The verified badge is present (accessible name = "Verified provider").
    expect(screen.getByLabelText(/verified provider/i)).toBeInTheDocument();
    // Specialty tags appear as chips (the word may also appear elsewhere
    // in nav — assert at least one match rather than "exactly one").
    expect(screen.getAllByText(/flowers/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/bouquets/i).length).toBeGreaterThan(0);
  });

  it('still renders the provider card for a provider with no Instagram handle', async () => {
    // The current template does not depend on instagram_handle for
    // rendering, so a null value should have no visible effect. Kept as
    // a regression check in case a "connect" button ever reappears
    // wired to instagram_handle.
    mockFetchSequence([
      {
        url: /\/api\/providers\?/,
        body: { providers: [{ ...providerFixture, instagram_handle: null }] },
      },
    ]);

    render(<ProvidersPage />);

    expect(await screen.findByText('The Petal Workshop')).toBeInTheDocument();
    expect(screen.getByText(/small-batch florists/i)).toBeInTheDocument();
  });
});
