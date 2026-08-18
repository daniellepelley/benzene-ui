import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SchemaTree } from './SchemaTree';
import type { JsonSchema } from '../../contracts';

/**
 * Schema readability, held to the bar Swagger UI and the AsyncAPI viewer set — because they solve
 * exactly this problem and a reader arrives having already used both.
 *
 * The tree used to render type, format, required and enum as four identical chips, so four
 * different kinds of fact competed at one weight, and it silently dropped every constraint keyword
 * the schema declared. A reader debugging a rejected payload could not discover from this page that
 * the field was capped at 12 characters.
 */
const schema: JsonSchema = {
  type: 'object',
  properties: {
    orderId: { type: 'string', format: 'uuid', description: 'The order this shipment belongs to.' },
    postcode: { type: 'string', maxLength: 12, pattern: '^[A-Z0-9 ]+$' },
    quantity: { type: 'integer', minimum: 1, maximum: 500 },
    channel: { type: 'string', enum: ['web', 'mobile', 'partner'] },
    lines: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
  required: ['orderId', 'postcode'],
};

describe('SchemaTree readability', () => {
  it('renders the description, which is what says what a field MEANS', () => {
    render(<SchemaTree schema={schema} />);
    expect(screen.getByText('The order this shipment belongs to.')).toBeInTheDocument();
  });

  it('renders the constraints the schema declares instead of dropping them', () => {
    render(<SchemaTree schema={schema} />);
    // All four were in `JsonSchema` and none of them reached the screen.
    expect(screen.getByText(/≤ 12 chars/)).toBeInTheDocument();
    expect(screen.getByText(/matches \/\^\[A-Z0-9 \]\+\$\//)).toBeInTheDocument();
    expect(screen.getByText(/1–500/)).toBeInTheDocument();
    expect(screen.getByText(/uuid/)).toBeInTheDocument();
  });

  it('says what a list is a list OF, rather than just "array"', () => {
    render(<SchemaTree schema={schema} />);
    expect(screen.getByText('array[string]')).toBeInTheDocument();
  });

  it('marks required on the name, and only on the required fields', () => {
    const { container } = render(<SchemaTree schema={schema} />);
    // Attached to the name rather than sitting in the row as a fourth chip competing with the type.
    const marks = container.querySelectorAll('.bz-schema-req');
    expect(marks.length).toBe(2);
    expect(marks[0]!.closest('.bz-schema-row')?.textContent).toContain('orderId');
  });

  it('separates the enum values instead of collapsing them into one string', () => {
    render(<SchemaTree schema={schema} />);
    // `web | mobile | partner` in a single chip is unreadable past three values and unsearchable.
    expect(screen.getByText('one of')).toBeInTheDocument();
    for (const value of ['web', 'mobile', 'partner']) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });

  it('gives the name, the type and the constraints three different treatments', () => {
    const { container } = render(<SchemaTree schema={schema} />);
    // The whole readability fix in one assertion: one thing monospaced, one coloured, one small and
    // grey. If these ever collapse back to one class, the page reads as noise again.
    expect(container.querySelector('.bz-schema-name')).toBeTruthy();
    expect(container.querySelector('.bz-schema-type')).toBeTruthy();
    expect(container.querySelector('.bz-schema-facets')).toBeTruthy();
  });
});
