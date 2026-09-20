// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from './helpers/mswServer';
import { CartProvider, useCart } from '@/lib/CartContext';
import { AuthProvider } from '@/lib/AuthContext';
import type { Product } from '@/lib/products';

const testProduct: Product = {
  id: 'p1',
  name: 'Celestial Constellation Kit',
  price: 38,
  rating: 4.8,
  reviews: 212,
  category: 'Gift Kits',
  subcategory: 'Astronomy',
  colors: ['Gold'],
  description: 'A kit.',
  details: [],
  emoji: '✨',
  gradient: 'from-indigo-500 to-purple-500',
};

/** Minimal harness exercising the same public API a real page would use. */
function CartHarness() {
  const { addItem, cartCount, subtotal, state, toggleWishlist } = useCart();
  return (
    <div>
      <button
        onClick={() =>
          addItem({ product: testProduct, quantity: 1, selectedColor: 'Gold' })
        }
      >
        Add to cart
      </button>
      <button onClick={() => toggleWishlist('p1')}>Toggle wishlist</button>
      <p data-testid="count">{cartCount}</p>
      <p data-testid="subtotal">{subtotal}</p>
      <p data-testid="wishlist">{state.wishlist.join(',')}</p>
    </div>
  );
}

/** Harness exercising add/remove/updateQty for two color variants of the same product. */
function MultiColorCartHarness() {
  const { addItem, removeItem, updateQty, state } = useCart();
  return (
    <div>
      <button onClick={() => addItem({ product: testProduct, quantity: 1, selectedColor: 'Gold' })}>Add Gold</button>
      <button onClick={() => addItem({ product: testProduct, quantity: 1, selectedColor: 'Silver' })}>Add Silver</button>
      <button onClick={() => removeItem(testProduct.id, 'Gold')}>Remove Gold</button>
      <button onClick={() => updateQty(testProduct.id, 'Silver', 5)}>Set Silver qty to 5</button>
      <ul>
        {state.items.map(i => (
          <li key={i.selectedColor} data-testid={`item-${i.selectedColor}`}>
            {i.selectedColor}:{i.quantity}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('CartContext', () => {
  beforeEach(() => {
    // CartProvider hydrates from/persists to localStorage on mount; jsdom
    // provides a real (in-memory) localStorage, so just make sure each test
    // starts from a clean slate.
    localStorage.clear();

    // CartProvider now reads auth state from AuthProvider's useAuth() (see
    // src/lib/CartContext.tsx), which itself calls GET /api/auth/me on
    // mount. This suite isn't testing the wishlist-sync behavior, so mock a
    // logged-out response to keep it deterministic and network-free.
    server.use(
      http.get('/api/auth/me', () => HttpResponse.json({ user: null }))
    );
  });

  it('updates cartCount and subtotal when an item is added via the "add to cart" action', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <CartProvider>
          <CartHarness />
        </CartProvider>
      </AuthProvider>
    );

    expect(screen.getByTestId('count').textContent).toBe('0');

    await user.click(screen.getByText('Add to cart'));

    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('subtotal').textContent).toBe('38');

    // Adding the same product + color again merges quantity rather than
    // creating a duplicate line item.
    await user.click(screen.getByText('Add to cart'));
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('subtotal').textContent).toBe('76');
  });

  it('syncs the wishlist to/from the server once a real (session-verified) user is present', async () => {
    // Auth is server-verified via GET /api/auth/me — this is the actual
    // signal CartContext should react to (previously it looked for a
    // 'doodle_g_user' localStorage key that AuthContext never wrote, so
    // none of this ever fired).
    let capturedLikeBody: unknown = null;
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({ user: { id: 'user-1', user_name: 'Alex', email: 'alex@example.com' } })
      ),
      http.get('/api/my-profile', () =>
        HttpResponse.json({ profile: { like_products_id: ['p9'] } })
      ),
      http.post('/api/my-profile/like', async ({ request }) => {
        capturedLikeBody = await request.json();
        return HttpResponse.json({ wishlist: ['p9', 'p1'] });
      })
    );

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <CartProvider>
          <CartHarness />
        </CartProvider>
      </AuthProvider>
    );

    // Wishlist loaded from the server on mount once `user` resolves.
    expect(await screen.findByText('p9')).toBeInTheDocument();

    await user.click(screen.getByText('Toggle wishlist'));
    expect(screen.getByTestId('wishlist').textContent).toBe('p9,p1');

    // The route resolves the user from the session cookie itself — the
    // client must not send a client-supplied userId in the body.
    expect(capturedLikeBody).toEqual({ productId: 'p1' });
  });

  it('removeItem/updateQty only affect the matching color variant, not every color of that product', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <CartProvider>
          <MultiColorCartHarness />
        </CartProvider>
      </AuthProvider>
    );

    await user.click(screen.getByText('Add Gold'));
    await user.click(screen.getByText('Add Silver'));
    expect(screen.getByTestId('item-Gold').textContent).toBe('Gold:1');
    expect(screen.getByTestId('item-Silver').textContent).toBe('Silver:1');

    // Updating the Silver variant's quantity must not touch Gold.
    await user.click(screen.getByText('Set Silver qty to 5'));
    expect(screen.getByTestId('item-Silver').textContent).toBe('Silver:5');
    expect(screen.getByTestId('item-Gold').textContent).toBe('Gold:1');

    // Removing the Gold variant must leave Silver untouched.
    await user.click(screen.getByText('Remove Gold'));
    expect(screen.queryByTestId('item-Gold')).not.toBeInTheDocument();
    expect(screen.getByTestId('item-Silver').textContent).toBe('Silver:5');
  });
});
