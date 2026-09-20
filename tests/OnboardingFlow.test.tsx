// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingPage from '@/app/onboarding/page';

describe('Onboarding flow — step 1 validation', () => {
  it('keeps "Continue" disabled until a recipient name is entered, then advances to step 2', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    expect(screen.getByText('Who is this special person?')).toBeInTheDocument();

    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).toBeDisabled();

    // Clicking a disabled button is a no-op — step should not advance.
    await user.click(continueButton);
    expect(screen.getByText('Who is this special person?')).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/e\.g\. Sarah, Mom, Uncle Jack/i);
    await user.type(nameInput, 'Jamie');

    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    // Step 2 heading should now be visible.
    expect(await screen.findByText(/step 2 of 4/i)).toBeInTheDocument();
  });
});
