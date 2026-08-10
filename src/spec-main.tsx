import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { createStore } from './store/store';
import { capabilitiesOf } from './store/slices/capabilitiesSlice';
import { loadSpec, loadSpecFromUrl } from './store/slices/specSlice';
import { useAppDispatch } from './store/hooks';
import { createMeshApi, optionsFromDocument } from './data/meshApi';
import { SpecPage } from './components/pages/SpecPage';
import { EmptyState } from './components/primitives/EmptyState';
import './theme/tokens.css';

/**
 * The mesh-hosted spec viewer, served beside the mesh UI.
 *
 * It reads the spec out of the aggregator's own `services/{name}.json`, which is why the service
 * itself only ever has to serve JSON — never HTML, and never with CORS opened to a dashboard.
 *
 * `?service=` names the service, `?manifest=` says where the artifacts live so this page resolves
 * them from the same place the mesh UI did, and `?mesh=` is the way back. All three are set by the
 * link the mesh UI builds.
 *
 * `?url=` is the standalone path: point it at any conforming spec document — a file, a service's own
 * `benzene:spec` response, a build artifact in CI — and it renders the same view. One page for both,
 * because the reading is identical and only the fetch differs; two pages would drift, and did.
 */
const params = new URLSearchParams(window.location.search);
const service = params.get('service');
const meshHref = params.get('mesh');

/**
 * Where the spec comes from, in order of precedence: an explicit `?url=`, then a `data-spec-url`
 * baked in by a host serving this page from inside a service (`Benzene.Spec.Ui` injects exactly
 * that), then the conventional relative path.
 *
 * The `./spec.json` default is the same convention the mesh UI uses for `manifest.json`: the
 * realistic static deployment is this page sitting beside the document it renders, and that should
 * need no query parameter and no configuration.
 */
const specUrl =
  params.get('url') ??
  document.documentElement.getAttribute('data-spec-url') ??
  (service ? null : 'spec.json');

const api = createMeshApi(optionsFromDocument(window.location, document.documentElement));
const store = createStore(api, { capabilities: capabilitiesOf(api, params.get('manifest') ?? undefined) });

function SpecApp() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (specUrl) void dispatch(loadSpecFromUrl(specUrl));
    else if (service) void dispatch(loadSpec(service));
  }, [dispatch]);

  if (!service && !specUrl) {
    return (
      <div className="bz-app">
        <EmptyState message="No spec was named. Open this page from the mesh UI, or add ?service=<name> for a mesh service, or ?url=<spec.json> for a spec document." />
      </div>
    );
  }
  return (
    <div className="bz-app">
      <SpecPage service={service} meshHref={meshHref} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <SpecApp />
    </Provider>
  </StrictMode>,
);
