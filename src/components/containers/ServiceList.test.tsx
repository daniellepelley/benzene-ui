import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createStore } from '../../store/store';
import { manifestRefreshed } from '../../store/slices/estateSlice';
import { fakeMeshApi } from '../../test/fakeMeshApi';
import { filterChanged, serviceToggled } from '../../store/slices/viewSlice';
import { ServiceList } from './ServiceList';
import { act } from 'react';

const withEstate = () => {
  const store = createStore(fakeMeshApi());
  store.dispatch(
    manifestRefreshed({
      generatedAtUtc: '2026-07-16T09:15:00Z',
      services: [
        { name: 'orders-api', status: 'healthy', contractDrift: false },
        { name: 'payments-api', status: 'unhealthy', contractDrift: true },
      ],
    }),
  );
  return store;
};

const renderWith = (store: ReturnType<typeof createStore>) =>
  render(
    <Provider store={store}>
      <ServiceList />
    </Provider>,
  );

describe('ServiceList — the UI is a function of the store', () => {
  it('renders what the store holds', () => {
    renderWith(withEstate());
    expect(screen.getByText('orders-api')).toBeInTheDocument();
    expect(screen.getByText('payments-api')).toBeInTheDocument();
  });

  it('follows the store when the filter changes — no component state involved', () => {
    const store = withEstate();
    renderWith(store);

    act(() => {
      store.dispatch(filterChanged('payments'));
    });

    expect(screen.queryByText('orders-api')).not.toBeInTheDocument();
    expect(screen.getByText('payments-api')).toBeInTheDocument();
  });

  it('expands from a dispatched action, not from a click', () => {
    // The point of the rule. Nothing touched the DOM here, yet the card is open — because "expanded"
    // is store state. A click is only one way to produce the action; deep-linking or a restored
    // session produces the same screen.
    const store = withEstate();
    renderWith(store);

    expect(screen.getByRole('button', { name: 'Expand orders-api' })).toBeInTheDocument();

    act(() => {
      store.dispatch(serviceToggled('orders-api'));
    });

    expect(screen.getByRole('button', { name: 'Collapse orders-api' })).toBeInTheDocument();
  });

  it('says why the list is empty rather than showing nothing', () => {
    const store = withEstate();
    renderWith(store);

    act(() => {
      store.dispatch(filterChanged('nothing-matches-this'));
    });

    expect(screen.getByText('No services match this filter.')).toBeInTheDocument();
  });
});
