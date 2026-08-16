import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectVisibleServices, selectComposableTopicsForService, selectTopicVersions,
  selectTransportsForTopic, selectExampleBody, selectComposeValidity, selectCanInvoke, NONE,
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
 * Deliberately a top-level page, not nested under a topic — `ComposePage` already serves that flow
 * for a reader who is already looking at one topic. This is the front door for a reader who is not:
 * they know the service (or are debugging one), and are looking for the topic, not the other way
 * round.
 */
export function TestConsolePage({ service, topic }: TestConsolePageProps) {
  const dispatch = useAppDispatch();
  const services = useAppSelector(selectVisibleServices);
  // NONE, not an inline `[]` — a fresh array literal mints a new reference every render, the exact
  // footgun selectors.ts's own NONE comment warns about, and would fail react-redux's dev-mode
  // "did this selector return something new" check on every render where nothing is picked yet.
  const topics = useAppSelector((s: RootState) =>
    (service ? selectComposableTopicsForService(s, service) : NONE) as TopicsTopicsItem[]);
  const versions = useAppSelector((s: RootState) =>
    (topic ? selectTopicVersions(s, topic) : NONE) as TopicsTopicsItem[]);
  const transports = useAppSelector((s: RootState) =>
    (topic ? selectTransportsForTopic(s, topic) : NONE) as string[]);
  const compose = useAppSelector((s: RootState) => s.compose);
  const exampleBody = useAppSelector((s: RootState) =>
    topic ? selectExampleBody(s, topic, compose.versionIndex) : '{}');
  const validity = useAppSelector(selectComposeValidity);
  const canSendMessages = useAppSelector(selectCanInvoke);

  // Seeding the draft from the schema is a lifecycle, not state — and composeOpened guards against
  // overwriting a dirty draft, so re-entering the page never discards what someone typed.
  useEffect(() => {
    if (service && topic) {
      // `composeOpened` resets the picker to index 0, so index 0's version is the one being seeded.
      dispatch(composeOpened({
        service, topic, exampleBody, transports, version: versions[0]?.version ?? null,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, service, topic]);

  const pickService = (name: string) =>
    dispatch(navigated({ page: 'test', selectedService: name || null, selected: null }));
  const pickTopic = (t: string) =>
    dispatch(navigated({ page: 'test', selectedService: service, selected: t || null }));

  return (
    <div className="bz-page">
      <header className="bz-page-head">
        <h2>Test Console</h2>
      </header>

      <p className="bz-page-note">
        Compose a message and send it through a service's real message pipeline — the same routing,
        validation, and handler a real transport would use. Bookmark or link a filled-in console
        (service and topic are both in the URL) as a step in a production runbook.
      </p>

      <div className="bz-compose-controls">
        <label>
          Service
          <select value={service ?? ''} onChange={(e) => pickService(e.target.value)}>
            <option value="">Choose a service…</option>
            {services.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </label>

        {service && (
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

      {!service && services.length === 0 && (
        <EmptyState message="No services are in the catalog yet." />
      )}

      {service && topics.length === 0 && (
        <EmptyState message={`${service} has no composable topic — it may only carry reserved traffic.`} />
      )}

      {service && topic && versions.length === 0 && (
        <EmptyState message={`${topic} has no composable version — it may be reserved, or not in the catalog.`} />
      )}

      {service && topic && versions.length > 0 && (
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
                      service,
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
