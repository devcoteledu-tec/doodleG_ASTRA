'use client';
import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { Product } from '@/lib/products';
import { useAuth } from '@/lib/AuthContext';

export interface CartItem {
  product: Product;
  quantity: number;
  selectedColor: string;
  selectedSize?: string;
}

interface CartState {
  items: CartItem[];
  wishlist: string[];
}

type CartAction =
  | { type: 'ADD'; item: CartItem }
  | { type: 'REMOVE'; id: string; selectedColor: string; selectedSize?: string }
  | { type: 'UPDATE_QTY'; id: string; selectedColor: string; selectedSize?: string; qty: number }
  | { type: 'CLEAR' }
  | { type: 'TOGGLE_WISH'; id: string }
  | { type: 'SET_WISHLIST'; ids: string[] }
  | { type: 'LOAD'; state: CartState };

const initialState: CartState = { items: [], wishlist: [] };

// A cart line is identified by product + color + size together — two
// different sizes of the same colored product are genuinely different
// line items (different providers may need to know which size to pack),
// not one merged quantity. `selectedSize` is optional (most products have
// no sizes at all), so undefined/empty are treated as the same "no size".
function sameLine(a: { product: Product; selectedColor: string; selectedSize?: string }, id: string, selectedColor: string, selectedSize?: string) {
  return a.product.id === id && a.selectedColor === selectedColor && (a.selectedSize || '') === (selectedSize || '');
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'LOAD':
      return action.state;
    case 'ADD': {
      const exists = state.items.findIndex(i => sameLine(i, action.item.product.id, action.item.selectedColor, action.item.selectedSize));
      if (exists >= 0) {
        const updated = [...state.items];
        updated[exists] = { ...updated[exists], quantity: updated[exists].quantity + action.item.quantity };
        return { ...state, items: updated };
      }
      return { ...state, items: [...state.items, action.item] };
    }
    case 'REMOVE':
      return {
        ...state,
        items: state.items.filter(i => !sameLine(i, action.id, action.selectedColor, action.selectedSize)),
      };
    case 'UPDATE_QTY':
      return {
        ...state,
        items: state.items.map(i =>
          sameLine(i, action.id, action.selectedColor, action.selectedSize)
            ? { ...i, quantity: Math.max(1, action.qty) }
            : i
        ),
      };
    case 'CLEAR':
      return { ...state, items: [] };
    case 'TOGGLE_WISH':
      return {
        ...state,
        wishlist: state.wishlist.includes(action.id)
          ? state.wishlist.filter(id => id !== action.id)
          : [...state.wishlist, action.id],
      };
    case 'SET_WISHLIST':
      return { ...state, wishlist: action.ids };
    default:
      return state;
  }
}

interface CartCtx {
  state: CartState;
  addItem: (item: CartItem) => void;
  removeItem: (id: string, selectedColor: string, selectedSize?: string) => void;
  updateQty: (id: string, selectedColor: string, qty: number, selectedSize?: string) => void;
  clearCart: () => void;
  toggleWishlist: (id: string) => void;
  cartCount: number;
  subtotal: number;
}

const CartContext = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const { user } = useAuth();

  // Hydrate cart from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('doodleg-cart');
      if (saved) dispatch({ type: 'LOAD', state: JSON.parse(saved) });
    } catch {}
  }, []);

  // Persist cart on change
  useEffect(() => {
    try { localStorage.setItem('doodleg-cart', JSON.stringify(state)); } catch { /* Storage is optional. */ }
  }, [state]);

  // Load wishlist from Supabase once the user is actually known to be
  // logged in (real server-verified auth state from useAuth(), not a
  // localStorage flag nothing ever wrote).
  useEffect(() => {
    if (!user) { queueMicrotask(() => dispatch({ type: 'SET_WISHLIST', ids: [] })); return; }

    fetch('/api/my-profile')
      .then(res => res.json())
      .then(data => {
        const likedIds: string[] = data?.profile?.like_products_id ?? [];
        dispatch({ type: 'SET_WISHLIST', ids: likedIds });
      })
      .catch(() => {/* silently ignore */});
  }, [user]);

  const addItem = (item: CartItem) => dispatch({ type: 'ADD', item });
  const removeItem = (id: string, selectedColor: string, selectedSize?: string) => dispatch({ type: 'REMOVE', id, selectedColor, selectedSize });
  const updateQty = (id: string, selectedColor: string, qty: number, selectedSize?: string) => dispatch({ type: 'UPDATE_QTY', id, selectedColor, selectedSize, qty });
  const clearCart = () => dispatch({ type: 'CLEAR' });

  // Toggle wishlist locally + sync to Supabase if logged in. The route
  // resolves the user from the session cookie itself, so no client-supplied
  // userId is sent.
  //
  // The optimistic local TOGGLE_WISH used to be the only thing that ever
  // ran — the persist fetch's result was never checked, success or
  // failure. That meant a failed save (missing DB function, expired
  // session, a network blip) looked exactly like a successful one in the
  // UI: the heart icon still filled in, right up until the next hard
  // refresh reloaded the real, unchanged data from the server and the item
  // silently vanished from the wishlist. Now a successful response
  // reconciles local state with the server's actual returned array (the
  // real source of truth), and a failure rolls the optimistic toggle back
  // instead of leaving the UI showing something that was never saved.
  const toggleWishlist = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_WISH', id });

    if (!user) return;

    fetch('/api/my-profile/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: id }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to save wishlist change');
        const data = await res.json();
        const wishlist: string[] = Array.isArray(data?.wishlist) ? data.wishlist : null;
        if (wishlist) {
          dispatch({ type: 'SET_WISHLIST', ids: wishlist });
        } else {
          // Response shape wasn't what we expected — safer to roll back
          // than to keep displaying an unconfirmed optimistic state.
          dispatch({ type: 'TOGGLE_WISH', id });
        }
      })
      .catch(() => {
        // Save failed (network error or non-2xx) — revert the optimistic
        // toggle so the UI never claims something is saved when it isn't.
        dispatch({ type: 'TOGGLE_WISH', id });
      });
  }, [user]);

  const cartCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = state.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{ state, addItem, removeItem, updateQty, clearCart, toggleWishlist, cartCount, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
