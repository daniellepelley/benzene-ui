import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

/**
 * Unmount between tests.
 *
 * Testing Library auto-cleans only when it can see a global `afterEach` at import time, and under
 * this config it could not — so every rendered tree stayed in `document.body` for the rest of the
 * file. A `screen.getByText` then searched the union of every test that had run before it, which
 * makes a passing assertion mean nothing in particular: the node it matched may belong to a store
 * three tests ago. That is the same failure the harness gate exists to prevent, one level down —
 * evidence that looks exactly like evidence and is not.
 */
afterEach(cleanup);
