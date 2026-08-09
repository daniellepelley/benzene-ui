import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectTopicVersions, selectTransportsForTopic, selectExampleBody, selectComposeValidity, selectCanInvoke,
} from '../../store/selectors';
import {
  composeOpened, versionSelected, transportSelected, bodyEdited, headersEdited, sendComposed,
} from '../../store/slices/composeSlice';
import { navigated } from '../../store/slices/viewSlice';
import { MessageComposer } from '../sections/MessageComposer';
import { EmptyState } from '../primitives/EmptyState';
import type { RootState } from '../../store/store';
import { exampleFromSchema, inboundSchema } from '../../store/exampleFromSchema';
import type { TopicsTopicsItem } from '../../contracts';

export interface ComposePageProps {
  topic: string;
}

export function ComposePage({ topic }: ComposePageProps) {
  const dispatch = useAppDispatch();
  const versions = useAppSelector((s: RootState) => selectTopicVersions(s, topic));
  const transports = useAppSelector((s: RootState) => selectTransportsForTopic(s, topic));
  const compose = useAppSelector((s: RootState) => s.compose);
  const exampleBody = useAppSelector((s: RootState) => selectExampleBody(s, topic, compose.versionIndex));
  const validity = useAppSelector(selectComposeValidity);
  const canSendMessages = useAppSelector(selectCanInvoke);

  // Seeding the draft from the schema is a lifecycle, not state — and composeOpened guards against
  // overwriting a dirty draft, so re-entering the page never discards what someone typed.
  useEffect(() => {
    dispatch(composeOpened({ topic, exampleBody, transports }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, topic]);

  if (versions.length === 0) {
    return <EmptyState message={`${topic} has no composable version — it may be reserved, or not in the catalog.`} />;
  }

  return (
    <div className="bz-page">
      <header className="bz-page-head">
        <h2>Compose · {topic}</h2>
        <button type="button" onClick={() => dispatch(navigated({ page: 'topic', selected: topic }))}>
          back to topic
        </button>
      </header>

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
        onVersion={(index) =>
          dispatch(versionSelected({ index, exampleBody: exampleBodyFor(versions, index) }))
        }
        onTransport={(t) => dispatch(transportSelected(t))}
        onBody={(b) => dispatch(bodyEdited(b))}
        onHeaders={(h) => dispatch(headersEdited(h))}
        {...(canSendMessages
          ? {
              onSend: () =>
                void dispatch(
                  sendComposed({
                    topic,
                    headers: safeParse(compose.headersJson),
                    body: compose.bodyJson,
                  }),
                ),
            }
          : {})}
      />
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
