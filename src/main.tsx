import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { createStore } from './store/store';
import { capabilitiesOf } from './store/slices/capabilitiesSlice';
import { connectRouting } from './store/routing';
import { createMeshApi, optionsFromDocument } from './data/meshApi';
import { App } from './App';
import './theme/tokens.css';

const options = optionsFromDocument(window.location, document.documentElement);
const api = createMeshApi(options);
const store = createStore(api, {
  // Deployment shape is state like everything else — see capabilitiesSlice.
  capabilities: capabilitiesOf(api, options.manifestUrl),
});

connectRouting(store, window);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
