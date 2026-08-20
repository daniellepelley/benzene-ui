import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectVisibleServices, selectComposableTopicsForService, selectTopicVersions,
  selectTransportsForTopic, selectExampleBody, selectComposeValidity, selectCanInvoke,
  selectHandlerServicesForTopic, NONE,
} from '../../store/selectors';
import {
  composeOpened, versionSelected, transportSelected, bodyEdited, headersEdited,
  sendConfirmationToggled, sendComposed,
} from '../../store/slices/composeSlice';
import { navigated } from '../../store/slices/viewSlice';
import { MessageComposer } from '../sections/MessageComposer';
import { EmptyState } from '../primitives/EmptyState';
import type { RootState } from '../../store/store';
import { exampleFromSchema, inboundSchema } from '../../store/exampleFromSchema';
import type { TopicsTopicsItem } from '../../contracts';

export interface TestConsolePageProps {
  service: string | null;
  topic: string | null;
}

/**
 * The adjacent-to-mesh-UI testing tool: pick a service, pick one of its topics, compose and send a
 * message through that service's own message pipeline — the same routing, validation, and handler a
 * real transport would use. Debugging use: open it, pick a service, fire a message. Runbook use: the
 * hash (`#test/<service>/<topic>`) is deep-linkable, so a documented procedure can link straight to a
 * pre-filled, ready-to-send console instead of describing the clicks.
 *
 * ONE console, two doors (mesh-ui-aims.md §3). A reader who knows the service arrives at `#test` and
 * picks a topic; a reader already looking at a topic arrives with the topic chosen and no service,
 * and the console resolves the service from that topic's declared handlers — the flow the separate
 * compose page used to serve. Merging them was a deliberate act: same job, and two pages meant two
 * composers, two seeding rules, and one of them quietly seeding the wrong version.
 */
export function TestConsolePage({ service, topic }: TestConsolePageProps) {
  const dispatch = useAppDispatch();
  const services = useAppSelector(selectVisibleServices);
  // NONE, not an inline `[]` — a fresh array literal mints a new reference every render, the exact
  // footgun selectors.ts's own NONE comment warns about, and would fail react-redux's dev-mode
  // "did this selector return something new" check on every render where nothing is picked yet.
  const topics = useAppSelector((s: RootState) =>
    (service ? selectComposableTopicsForService(s, service) : NONE) as TopicsTopicsItem[]);
  // The services that HANDLE this topic. A dispatch invokes a topic ON a target, so the target must
  // be the one with the handler, never the one that emits it.
  const handlers = useAppSelector((s: RootState) =>
    (topic ? selectHandlerServicesForTopic(s, topic) : NONE) as string[]);
  const versions = useAppSelector((s: RootState) =>
    (topic ? selectTopicVersions(s, topic) : NONE) as TopicsTopicsItem[]);
  const transports = useAppSelector((s: RootState) =>
    (topic ? selectTransportsForTopic(s, topic) : NONE) as string[]);
  const compose = useAppSelector((s: RootState) => s.compose);
  // The skeleton for the version about to be SELECTED, which is not necessarily the one the store
  // currently holds — seeding index N with version 0's body is the bug this separates out.
  const bodyForIndex = useAppSelector(
    (s: RootState) => (index: number) => (topic ? selectExampleBody(s, topic, index) : '{}'),
  );
  const validity = useAppSelector(selectComposeValidity);
  const canSendMessages = useAppSelector(selectCanInvoke);
  // Arriving topic-first: one handler resolves itself, several ask, none says so. Without this the
  // merged console would answer a topic-only link with an empty service picker and no explanation.
  const resolvedService = service ?? (handlers.length === 1 ? handlers[0]! : null);
  // Only assert that a service is absent once there is a manifest to assert it against. An empty
  // list means the estate has not loaded, not that the service does not exist — the same third-state
  // rule the rest of the product follows, applied to a route parameter. Checked against the RESOLVED
  // service: on a topic-first arrival the raw prop is null, which is not the same as unknown.
  const known = services.length === 0
    || resolvedService == null
    || services.some((s) => s.name === resolvedService);
  // Which version the reader was looking at when they pressed through. Seeding index 0 regardless is
  // how a console shows a v2 label above a v1 payload, with fields v2 had deleted included.
  const arrivedAtVersion = useAppSelector((s: RootState) => s.view.selectedVersion);
  const seedIndex = (() => {
    const at = versions.findIndex((v) => v.version === arrivedAtVersion);
    return at >= 0 ? at : 0;
  })();

  // Seeding the draft from the schema is a lifecycle, not state — and composeOpened guards against
  // overwriting a dirty draft, so re-entering the page never discards what someone typed.
  //
  // `versions.length` IS a dependency, and leaving it out is what broke the one thing this page
  // advertises. On a deep link the catalogue has not loaded when the effect first runs, so there is
  // no schema to seed from and no version to send: the effect fired once against an empty catalogue
  // and never again, because the service and topic in the URL never change. The console then sat
  // there with `{}` for a body and no version header — and would happily send it. The page's own
  // header invites a reader to bookmark this URL as a runbook step, so the surface that promises
  // repeatability was the one that could not deliver it.
  useEffect(() => {
    if (resolvedService && topic) {
      dispatch(composeOpened({
        service: resolvedService,
        topic,
        exampleBody: bodyForIndex(seedIndex),
        transports,
        versionIndex: seedIndex,
        // The version travels with the message, not just its skeleton — see `seedHeaders`.
        version: versions[seedIndex]?.version ?? null,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, resolvedService, topic, arrivedAtVersion, versions.length]);

  // Choosing a service KEEPS the topic when the reader arrived topic-first. Clearing it
  // unconditionally would throw away the half they had already chosen — the same defect the route
  // parser was fixed for.
  const pickService = (name: string) =>
    dispatch(navigated({ page: 'test', selectedService: name || null, selected: topic }));
  const pickTopic = (t: string) =>
    dispatch(navigated({ page: 'test', selectedService: resolvedService, selected: t || null }));

  return (
    <div className="bz-page">
      <header className="bz-page-head">
        <h2>Test Console</h2>
      </header>

      {/* The withdrawn runbook copy is gone. It invited a reader to bookmark this as a production
          runbook step while `MeshDispatchGate` in the same product refuses to dispatch in
          production by default — the product contradicting itself, in an instruction. */}
      <p className="bz-page-note">
        Compose a message and send it through a service&rsquo;s real message pipeline — the same
        routing, validation, and handler a real transport would use. The service and topic are both
        in the URL, so a filled-in console can be linked or shared.
      </p>

      <div className="bz-compose-controls">
        <label>
          Service
          <select value={resolvedService ?? ''} onChange={(e) => pickService(e.target.value)}>
            <option value="">Choose a service…</option>
            {services.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </label>

        {resolvedService && (
          <label>
            Topic
            <select value={topic ?? ''} onChange={(e) => pickTopic(e.target.value)}>
              <option value="">Choose a topic…</option>
              {topics.map((t) => (
                <option key={t.topic} value={t.topic}>{t.topic}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Arriving topic-first with an ambiguous or absent handler. The console cannot guess which
          service to invoke, and guessing would fire a real handler on a service nobody chose. */}
      {topic && !resolvedService && handlers.length > 1 && (
        <p className="bz-page-note">
          {handlers.length} services declare handling {topic} ({handlers.join(', ')}). A dispatch
          invokes it on one of them, so pick which above.
        </p>
      )}
      {topic && !resolvedService && handlers.length === 0 && (
        <EmptyState
          message={`No service in the catalogue declares handling ${topic}, so there is nothing in this estate to send it to. Its handlers may be outside the estate, or this version may not be deployed yet.`}
        />
      )}

      {!resolvedService && !topic && services.length === 0 && (
        <EmptyState message="No services are in the catalog yet." />
      )}

      {/* An unknown service gets the same treatment as an unknown topic or an unknown route. It was
          the one identifier in the product that went unvalidated, so `#test/does-not-exist/<topic>`
          rendered a working, sendable console — the only place a bad URL produced fake evidence
          instead of an honest empty state. The message it fell through to was also wrong: it said
          the service carried only reserved traffic, which asserts something about a service that
          does not exist. */}
      {resolvedService && !known && (
        <EmptyState message={`${resolvedService} is not in the estate manifest, so there is nothing to send it.`} />
      )}

      {resolvedService && known && topics.length === 0 && (
        <EmptyState message={`${service} has no composable topic — it may only carry reserved traffic.`} />
      )}

      {resolvedService && known && topic && versions.length === 0 && (
        <EmptyState message={`${topic} has no composable version — it may be reserved, or not in the catalog.`} />
      )}

      {resolvedService && known && topic && versions.length > 0 && (
        <MessageComposer
          versions={versions}
          versionIndex={compose.versionIndex}
          transports={transports}
          transport={compose.transport}
          headersJson={compose.headersJson}
          bodyJson={compose.bodyJson}
          bodyValid={validity.bodyValid}
          headersValid={validity.headersValid}
          canSend={validity.canSend}
          send={compose.send}
          error={compose.error}
          result={compose.result}
          confirmed={compose.confirmed}
          onVersion={(index) =>
            dispatch(versionSelected({
              index,
              exampleBody: exampleBodyFor(versions, index),
              version: versions[index]?.version ?? null,
            }))
          }
          onTransport={(t) => dispatch(transportSelected(t))}
          onBody={(b) => dispatch(bodyEdited(b))}
          onHeaders={(h) => dispatch(headersEdited(h))}
          onConfirmToggle={() => dispatch(sendConfirmationToggled())}
          {...(canSendMessages
            ? {
                onSend: () =>
                  void dispatch(
                    sendComposed({
                      service: resolvedService,
                      topic,
                      headers: safeParse(compose.headersJson),
                      body: compose.bodyJson,
                    }),
                  ),
              }
            : {})}
        />
      )}
    </div>
  );
}

const safeParse = (json: string): Record<string, string> => {
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
};

/** Re-derives the skeleton for a newly picked version, since each version has its own schema. */
function exampleBodyFor(versions: TopicsTopicsItem[], index: number): string {
  const version = versions[index] ?? versions[0];
  if (!version) return '{}';
  return JSON.stringify(exampleFromSchema(inboundSchema(version)), null, 2);
}
