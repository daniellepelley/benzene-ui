import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectTopicVersions, selectTransportsForTopic, selectExampleBody, selectComposeValidity, selectCanInvoke,
  selectProducerServicesForTopic,
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

export interface ComposePageProps {
  topic: string;
  /** The service half of the compose target — see `resolvedService` below for why this is optional. */
  service: string | null;
}

export function ComposePage({ topic, service }: ComposePageProps) {
  const dispatch = useAppDispatch();
  const versions = useAppSelector((s: RootState) => selectTopicVersions(s, topic));
  const transports = useAppSelector((s: RootState) => selectTransportsForTopic(s, topic));
  const producers = useAppSelector((s: RootState) => selectProducerServicesForTopic(s, topic));
  const compose = useAppSelector((s: RootState) => s.compose);
  const validity = useAppSelector(selectComposeValidity);
  // Bound to the store so the seeding effect can build a skeleton for any version, not just the one
  // currently selected.
  const bodyForIndex = useAppSelector(
    (s: RootState) => (index: number) => selectExampleBody(s, topic, index),
  );
  const canSendMessages = useAppSelector(selectCanInvoke);
  // Which version the reader was looking at when they pressed compose. Without this the console
  // seeded the OLDEST version's skeleton — arriving from a v2 page produced a v1 body, fields the
  // new version had deleted included.
  const arrivedAtVersion = useAppSelector((s: RootState) => s.view.selectedVersion);

  // A topic can have more than one producer (or, for a purely-consumed event with no declared
  // producer, none at all) — dispatch needs exactly one, so an unambiguous topic resolves itself and
  // an ambiguous one asks, rather than the page silently guessing which service to target.
  const resolvedService = producers.length === 1 ? producers[0]! : service;

  // Seeding the draft from the schema is a lifecycle, not state — and composeOpened guards against
  // overwriting a dirty draft, so re-entering the page never discards what someone typed.
  useEffect(() => {
    if (resolvedService) {
      // The skeleton has to be built for the version we are about to select, not for whatever index
      // the store happens to hold — seeding index N with version 0's body is how a console shows a
      // v2 label above a v1 payload.
      const at = versions.findIndex((v) => v.version === arrivedAtVersion);
      const index = at >= 0 ? at : versions.length - 1;
      dispatch(composeOpened({
        service: resolvedService, topic, exampleBody: bodyForIndex(index), transports, versionIndex: index,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, resolvedService, topic, arrivedAtVersion]);

  if (versions.length === 0) {
    return <EmptyState message={`${topic} has no composable version — it may be reserved, or not in the catalog.`} />;
  }

  const pickService = (name: string) =>
    dispatch(navigated({ page: 'compose', selected: topic, selectedService: name || null }));

  return (
    <div className="bz-page">
      <header className="bz-page-head">
        <h2>Compose · {topic}</h2>
        <button type="button" onClick={() => dispatch(navigated({ page: 'topic', selected: topic }))}>
          back to topic
        </button>
      </header>

      {producers.length !== 1 && (
        <div className="bz-compose-controls">
          <label>
            Service
            <select value={service ?? ''} onChange={(e) => pickService(e.target.value)}>
              <option value="">Choose a service…</option>
              {producers.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          {producers.length === 0 && (
            <p className="bz-page-note">
              No service in the catalog declares itself a producer of {topic} — pick one it is
              believed to come from, or use the Test Console to target any service directly.
            </p>
          )}
        </div>
      )}

      {resolvedService && (
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
            dispatch(versionSelected({ index, exampleBody: exampleBodyFor(versions, index) }))
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
