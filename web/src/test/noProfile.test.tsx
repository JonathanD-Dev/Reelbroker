import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { createAccount } from '../lib/accounts';
import { writeSession } from '../lib/session';

let original: typeof fetch;
beforeEach(() => {
  vi.stubEnv('VITE_USE_API', 'true');
  original = globalThis.fetch;
  // Server up but nothing to show for an account without a profile (empty snapshot).
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = original;
  vi.unstubAllEnvs();
  localStorage.clear();
  sessionStorage.clear();
});

describe('account without an investor profile', () => {
  it('shows the questionnaire prompt instead of the fictional "Buy" cards', async () => {
    const id = createAccount('Ancien compte', {} as Parameters<typeof createAccount>[1]);
    writeSession(id);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Commençons par votre profil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Répondre au questionnaire' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Buy' })).not.toBeInTheDocument();
    expect(screen.getByText(/Profil d’investisseur manquant/)).toBeInTheDocument();
  });
});
