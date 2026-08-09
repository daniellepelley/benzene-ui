import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { createStore } from './store/store';
import { connectRouting } from './store/routing';
import { createMeshApi, optionsFromDocument } from './data/meshApi';
import { App } from './App';
import './theme/tokens.css';

const store = createStore(
  createMeshApi(optionsFromDocument(window.location, document.documentElement)),
);

connectRouting(store, window);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
