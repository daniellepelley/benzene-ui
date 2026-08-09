import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { createStore } from './store/store';
import { connectRouting } from './store/routing';
import { createMeshApi } from './data/meshApi';
import { App } from './App';
import './theme/tokens.css';

const params = new URLSearchParams(window.location.search);
const store = createStore(
  createMeshApi({
    fleetEndpoint: params.get('fleet') ?? undefined,
    annotationsEndpoint: params.get('annotations') ?? undefined,
  }),
);

connectRouting(store, window);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
