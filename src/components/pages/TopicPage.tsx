import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectTopic, selectTrafficForTopic, selectThread, selectCanPost, selectCanAnnotate,
  selectVersionCompatibility, selectHttpMappingsForTopic, selectLiveForTopic, versionLabel,
  selectRolloutForTopic,
  selectFlowsForTopic, selectFailingFlowsOnly, selectTopicCompatibility, selectVersionSwitcher,
  selectComparisonsPublished, selectTopicEntries,
} from '../../store/selectors';
import { EdgeLivenessChip } from '../controls/EdgeLivenessChip';
import {
  navigated, failingFlowsToggled, pivotedToFailingFlows, topicVersionSelected,
} from '../../store/slices/viewSlice';
import { draftChanged, draftAuthorChanged, postAnnotation } from '../../store/slices/annotationsSlice';
import { SchemaTree, type SchemaAnnotation } from '../sections/SchemaTree';
import { ContractChanges } from '../sections/ContractChanges';
import { VersionSwitcher } from '../controls/VersionSwitcher';
import { VersionCompatibility } from '../sections/VersionCompatibility';
import { TopicLiveStrip } from '../sections/TopicLiveStrip';
import { UsagePanel } from '../controls/UsagePanel';
import { FlowList } from '../controls/FlowList';
import { Thread } from '../sections/Thread';
import { Composer } from '../sections/Composer';
import { ValueRow } from '../controls/ValueRow';
import { PageHead } from '../controls/PageHead';
import { Badge } from '../primitives/Badge';
import { Chip } from '../primitives/Chip';
import { EmptyState } from '../primitives/EmptyState';
import type { RootState } from '../../store/store';

export interface TopicPageProps {
  topic: string;
}

export function TopicPage({ topic }: TopicPageProps) {
  const dispatch = useAppDispatch();
  const entry = useAppSelector((s: RootState) => selectTopic(s, topic));
  const traffic = useAppSelector((s: RootState) => selectTrafficForTopic(s, topic));
  const entity = `topic:${topic}`;
  const thread = useAppSelector((s: RootState) => selectThread(s, entity));
  const canPost = useAppSelector(selectCanPost);
  const annotations = useAppSelector((s: RootState) => s.annotations);
  const writable = useAppSelector(selectCanAnnotate);
  const compatibility = useAppSelector((s: RootState) => selectVersionCompatibility(s, topic));
  // The other half of the same question, for the exact version pair on screen.
  const rollout = useAppSelector((s: RootState) => selectRolloutForTopic(s, topic));
  const httpMappings = useAppSelector((s: RootState) => selectHttpMappingsForTopic(s, topic));
  const live = useAppSelector((s: RootState) => selectLiveForTopic(s, topic));
  const flows = useAppSelector((s: RootState) => selectFlowsForTopic(s, topic));
  const failingOnly = useAppSelector(selectFailingFlowsOnly);
  const contract = useAppSelector((s: RootState) => selectTopicCompatibility(s, topic));
  const versions = useAppSelector((s: RootState) => selectVersionSwitcher(s, topic));
  const comparisonsPublished = useAppSelector(selectComparisonsPublished);
  const allEntries = useAppSelector((s: RootState) => selectTopicEntries(s, topic));
  const selectedVersion = useAppSelector((s: RootState) => s.view.selectedVersion);

  if (!entry) {
    // Two different failures, two different actions. "The topic isn't published" and "that version
    // was retired" send a reader to opposite places, and version-addressable URLs make the second
    // one routine — every stale bookmark and every link to a retired version lands here.
    if (allEntries.length > 0) {
      return (
        <EmptyState
          message={`${topic} has no version ${selectedVersion}. Published versions: ${
            allEntries.map((e) => e.version || 'unversioned').join(', ')}.`}
          action={{ label: `Open the newest version`, onClick: () => dispatch(topicVersionSelected(null)) }}
        />
      );
    }
    return <EmptyState message={`${topic} is not in the published catalog.`} />;
  }

  // The version this one was compared against, so REMOVED fields can still be drawn on the contract.
  // Without it the most consequential class of change would be the one class invisible on the tree.
  const baseline = contract?.baselineVersion != null
    ? allEntries.find((e) => e.version === contract.baselineVersion) ?? null
    : null;

  // Field-level changes, keyed by the path SchemaTree walks. `truncatedPaths` rides along so a node
  // whose type changed can say that nothing beneath it was compared.
  const fieldMarks = new Map<string, SchemaAnnotation>(
    (contract?.changes ?? []).map((change) => [change.path, {
      kind: change.kind,
      compatibility: change.compatibility,
      description: change.description,
      truncated: contract!.truncatedPaths.includes(change.path),
    }]),
  );

  const openService = (name: string) => dispatch(navigated({ page: 'service', selected: name }));

  return (
    <div className="bz-page">
      <PageHead
        mono
        breadcrumb={[{ label: 'Estate', onClick: () => dispatch(navigated({ page: 'fleet' })) }]}
        title={entry.topic}
        lede="Who produces and consumes this topic, the payload contract on it, and what traffic it has actually carried."
        badges={
          <>
            {versionLabel(entry.version) && <Chip title="Payload schema version">{versionLabel(entry.version)}</Chip>}
            {entry.reserved && <Chip title="A topic Benzene itself owns">reserved</Chip>}
            {entry.status && <Badge rag={entry.status === 'gap' ? 'amber' : 'red'} title="Flagged by the aggregator">{entry.status}</Badge>}
            {entry.schemaMismatch && <Badge rag="red" title="Producer and consumer disagree on the payload shape">schema mismatch</Badge>}
          </>
        }
        actions={
          !entry.reserved ? (
            <button
              type="button"
              // The version the reader is LOOKING at, carried through. `navigated` clears
              // `selectedVersion` unless it is passed, so composing from a v1 page landed on the
              // newest version's skeleton — a reader on v1 pressed compose and got a v2 request.
              // That is round 5's version trap relocated: the page they came from said one thing and
              // the message they were about to send said another.
              onClick={() => dispatch(navigated({
                page: 'compose', selected: topic, selectedVersion: entry.version,
              }))}
            >
              compose a message
            </button>
          ) : undefined
        }
      />

      {/* Directly under the head, because which version you are looking at changes the meaning of
          every field below it. Renders nothing when there is only one version to look at. */}
      <VersionSwitcher
        versions={versions}
        collapsed={!comparisonsPublished && allEntries.length === 1}
        onSelect={(version) => dispatch(topicVersionSelected(version))}
      />

      <section>
        <ValueRow label="Consumers">
          {entry.consumers.length === 0
            ? 'none'
            : entry.consumers.map((c) => (
                <span key={c.service} className="bz-vr-peer">
                  <button type="button" onClick={() => openService(c.service)}>
                    {c.service}
                  </button>
                  <EdgeLivenessChip activity={entry.consumerActivity?.[c.service]} />
                </span>
              ))}
        </ValueRow>
        <ValueRow label="Producers">
          {entry.producers.length === 0
            ? 'none'
            : entry.producers.map((p) => (
                <span key={p.service} className="bz-vr-peer">
                  <button type="button" onClick={() => openService(p.service)}>
                    {p.service}
                  </button>
                  <EdgeLivenessChip activity={entry.providerActivity?.[p.service]} />
                </span>
              ))}
        </ValueRow>
        {/* The wire binding — the only place a reader can see how to actually reach this topic. */}
        {httpMappings.length > 0 && (
          <ValueRow label="HTTP">
            {httpMappings.map((m, i) => (
              <Chip key={i} title={`Exposed by ${m.service}`}>
                {m.method.toUpperCase()} {m.path}
              </Chip>
            ))}
          </ValueRow>
        )}
      </section>

      {/* Placed above Traffic: on a page a reader opens to decide whether to ship, what changed in
          the contract outranks how much traffic it carried. */}
      <ContractChanges compatibility={contract} published={comparisonsPublished} version={entry.version} />

      <VersionCompatibility compatibility={compatibility} rollout={rollout} />

      <section>
        <h3>Traffic</h3>
        {/* Two planes, two windows. The strip states its own; the panel states the feed's. */}
        <TopicLiveStrip
          live={live}
          traffic={traffic}
          onShowFailingFlows={() => dispatch(pivotedToFailingFlows(topic))}
        />
        <UsagePanel traffic={traffic} windowLabel="over the usage feed's own window" version={entry.version} />
      </section>

      {flows.available && (
        <section>
          <h3>Flows</h3>
          <FlowList
            view={flows}
            failingOnly={failingOnly}
            subject={topic}
            onToggleFailing={() => dispatch(failingFlowsToggled())}
            onOpenService={openService}
          />
        </section>
      )}

      <section>
        <h3>Payload</h3>
        {/* The contract, with the drift marked ON it rather than listed beside it. */}
        {entry.requestSchema && (
          <>
            <h4>Request</h4>
            <SchemaTree
              schema={entry.requestSchema}
              annotations={fieldMarks}
              rootPath={`${entry.topic}.request`}
              baseline={baseline?.requestSchema ?? null}
            />
          </>
        )}
        {entry.responseSchema && (
          <>
            <h4>Response</h4>
            <SchemaTree
              schema={entry.responseSchema}
              annotations={fieldMarks}
              rootPath={`${entry.topic}.response`}
              baseline={baseline?.responseSchema ?? null}
            />
          </>
        )}
        {entry.messageSchema && (
          <>
            <h4>Message</h4>
            <SchemaTree
              schema={entry.messageSchema}
              annotations={fieldMarks}
              rootPath={`${entry.topic}.message`}
              baseline={baseline?.messageSchema ?? null}
            />
          </>
        )}
        {!entry.requestSchema && !entry.responseSchema && !entry.messageSchema && (
          <EmptyState message="No schema published for this topic." />
        )}
      </section>

      {entry.changes && entry.changes.length > 0 && (
        <section>
          <h3>Since the previous snapshot</h3>
          <ul>{entry.changes.map((c, i) => <li key={i}><Chip>{c.kind}</Chip> {c.description}</li>)}</ul>
        </section>
      )}

      <section>
        <h3>Discussion</h3>
        <Thread annotations={thread} />
        <Composer
          draft={annotations.draft}
          author={annotations.draftAuthor}
          canPost={canPost}
          posting={annotations.post === 'posting'}
          error={annotations.postError}
          onDraftChange={(t) => dispatch(draftChanged(t))}
          onAuthorChange={(a) => dispatch(draftAuthorChanged(a))}
          {...(writable
            ? {
                onPost: () =>
                  void dispatch(
                    postAnnotation({ entity, author: annotations.draftAuthor, text: annotations.draft }),
                  ),
              }
            : {})}
        />
      </section>
    </div>
  );
}
