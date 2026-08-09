import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { createStore } from './store/store';
import { createMeshApi } from './data/meshApi';
import { App } from './App';
import './theme/tokens.css';

const store = createStore(createMeshApi());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
