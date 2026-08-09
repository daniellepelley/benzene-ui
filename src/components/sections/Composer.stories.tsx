import type { Meta, StoryObj } from '@storybook/react';
import { Composer } from './Composer';

const meta = {
  title: 'Sections/Composer',
  component: Composer,
  parameters: { docs: { description: { component: 'The draft lives in the store, so a half-typed note survives navigating away — and a failed post never discards what someone wrote.' } } },
  args: { draft: '', author: '', canPost: false, posting: false, error: null, onPost: () => {}, onDraftChange: () => {}, onAuthorChange: () => {} },
} satisfies Meta<typeof Composer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Ready: Story = { args: { draft: 'This looks like a gap in the consumer side.', author: 'Dani', canPost: true } };
export const Posting: Story = { args: { draft: 'Sending…', author: 'Dani', canPost: false, posting: true } };
export const Failed: Story = { args: { draft: 'kept after failure', author: 'Dani', canPost: true, error: 'This mesh is read-only — no annotation endpoint' } };
export const ReadOnlyMesh: Story = { args: { onPost: undefined } };
