import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Scoped to the routes/services this test pass actually covers (see
      // README's "Testing" section for the full list of routes still
      // needing tests before they're folded into this gate). Widening
      // `include` to all of src/app/api/** before writing tests for the
      // rest would make this threshold meaningless — it would either fail
      // permanently or have to be set near 0%.
      include: [
        'src/app/api/auth/signup/route.ts',
        'src/app/api/auth/signin/route.ts',
        'src/app/api/auth/verify-email/route.ts',
        'src/app/api/auth/resend-code/route.ts',
        'src/app/api/auth/google/route.ts',
        'src/app/api/auth/complete-profile/route.ts',
        'src/app/api/orders/route.ts',
        'src/app/api/update-order-tier/route.ts',
        'src/app/api/cron/route.ts',
        'src/app/api/whatsapp/webhook/route.ts',
        'src/services/ai.ts',
        'src/services/whatsapp.ts',
        'src/lib/giftDomain.ts',
        'src/lib/sessionToken.ts',
        'src/lib/checkout.ts',
        'src/lib/orderPricing.ts',
        'src/lib/paymentPlan.ts',
        'src/app/api/checkout/razorpay-order/route.ts',
        'src/app/api/razorpay/webhook/route.ts',
      ],
      thresholds: {
        // Deliberately modest starting bar so CI can enforce "coverage never
        // silently regresses" without blocking on the parts of the app
        // (client components, page routes, and the many API routes not yet
        // covered) this pass didn't get to. Raise this over time as more of
        // src/app/api & src/services gets test coverage and gets added to
        // the `include` list above.
        lines: 75,
        statements: 70,
        branches: 65,
        functions: 65,
      },
    },
  },
});
