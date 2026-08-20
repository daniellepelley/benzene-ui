import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  selectTopic, selectTrafficForTopic,
  selectVersionCompatibility, selectHttpMappingsForTopic, selectLiveForTopic, versionLabel,
  selectRolloutForTopic, selectUsageWindow,
  selectFlowsForTopic, selectFailingFlowsOnly, selectTopicCompatibility, selectVersionSwitcher,
  selectUsageRowsForTopic,
  selectComparisonsPublished, selectTopicEntries, selectNow, selectRangeMs, RANGE_OPTIONS,
} from '../../store/selectors';
import { EdgeLivenessChip } from '../controls/EdgeLivenessChip';
import {
  navigated, failingFlowsToggled, pivotedToFailingFlows, topicVersionSelected, rangeChanged,
} from '../../store/slices/viewSlice';
import { SchemaTree, type SchemaAnnotation } from '../sections/SchemaTree';
import { ContractChanges } from '../sections/ContractChanges';
import { VersionSwitcher } from '../controls/VersionSwitcher';
import { VersionCompatibility } from '../sections/VersionCompatibility';
import { TopicLiveStrip } from '../sections/TopicLiveStrip';
import { UsagePanel } from '../controls/UsagePanel';
import { FlowList } from '../controls/FlowList';
import { ValueRow } from '../controls/ValueRow';
import { Card } from '../primitives/Card';
import { Keyline } from '../primitives/Keyline';
import { PageHead } from '../controls/PageHead';
import { Badge } from '../primitives/Badge';
import { Chip } from '../primitives/Chip';
import { EmptyState } from '../primitives/EmptyState';
import { Stamp } from '../primitives/Stamp';
import { RangePicker } from '../controls/RangePicker';
import type { RootState } from '../../store/store';

export interface TopicPageProps {
  topic: string;
}

export function TopicPage({ topic }: TopicPageProps) {
  const dispatch = useAppDispatch();
  const entry = useAppSelector((s: RootState) => selectTopic(s, topic));
  const traffic = useAppSelector((s: RootState) => selectTrafficForTopic(s, topic));
  const usageRows = useAppSelector((s: RootState) => selectUsageRowsForTopic(s, topic));
  const usageWindow = useAppSelector(selectUsageWindow);
  const now = useAppSelector(selectNow);
  const rangeMs = useAppSelector(selectRangeMs);
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
            {entry.schemaMismatch && <Badge rag="red">schema mismatch</Badge>}
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
                page: 'test', selected: topic, selectedService: null, selectedVersion: entry.version,
              }))}
            >
              test this topic
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

      {/* THE BADGE GETS A BODY. `schemaMismatch` shipped as a bare red badge with a tooltip and
          nothing else — the same "a detection is not a finding" defect as the drift hash, on the one
          flag that says two services will fail to talk to each other. The aggregator holds both
          schemas when it sets this, so which fields differ is publishable and is a named follow-up
          (product vision §5.5). Until it is, the page says what IS known and what is not, rather
          than a red word a reader cannot act on. */}
      {entry.schemaMismatch && (
        <p className="bz-feed-health" data-kind="degraded">
          The services handling <strong>{topic}</strong> do not all declare the same payload shape,
          so at least one of them will reject messages another treats as valid. Which fields differ is
          not published yet — compare the Contract below against each consumer&rsquo;s own spec.
        </p>
      )}

      <Card title="Ends" note="Who handles this topic, who sends it, and how it is reached">
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
      </Card>

      {/* ONE CARD, THREE AXES. This page told a reader "what changed" three times in three
          costumes — a field list against the previous version, a version-coverage panel, and a
          run-over-run card further down — each individually honest, and jointly demanding that the
          reader work out they were describing one event. They are three answers to three genuinely
          different questions, so none is deleted; they are grouped, sub-headed, and ordered from the
          question a reader opens this page with.

          Placed above Traffic deliberately: deciding whether to ship outranks how much traffic the
          topic carried. */}
      <Card title="What changed">
        <ContractChanges compatibility={contract} published={comparisonsPublished} version={entry.version} />
        <VersionCompatibility compatibility={compatibility} rollout={rollout} />
        {entry.changes && entry.changes.length > 0 && (
          <>
            <h4>Since the previous run</h4>
            <p className="bz-page-note">
              What moved between the last published catalogue and this one — including an in-place
              edit to an already-published version, which has no version pair and so appears nowhere
              above.
            </p>
            <ul className="bz-ledger">
              {entry.changes.map((c, i) => (
                <li key={i} className="bz-change" data-verdict={c.compatibility ?? undefined}>
                  <Chip>{c.kind}</Chip>
                  <span className="bz-change-desc">{c.description}</span>
                  {c.schemaChanges && c.schemaChanges.length > 0 && (
                    <ul className="bz-schema-drift">
                      {c.schemaChanges.map((f, j) => (
                        <li key={j} data-verdict={f.compatibility}>
                          <span className="bz-verdict bz-verdict-inline" data-verdict={f.compatibility}>
                            {f.compatibility}
                          </span>
                          <code className="bz-change-path">{f.path}</code>
                          <span className="bz-change-desc">{f.description}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.schemaChanges == null && c.kind === 'schema-changed' && (
                    <span className="bz-schema-facets">
                      this catalogue does not classify drift, so which fields moved is unknown
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* THE PICKER LIVES HERE, on the surface whose data it governs, not in the chrome. This strip
          is the one place in the product that already stated its own window correctly — "counts
          cover from …" — and it was the page NOT carrying the control. A global picker over a
          per-surface fact moved numbers it did not govern and left numbers that looked like it did.
          It now sits in the card's own actions slot, which is what that slot is for. */}
      <Card
        title="Traffic"
        actions={(
          <RangePicker
            rangeMs={rangeMs}
            options={RANGE_OPTIONS}
            available={live.available}
            onChange={(ms) => dispatch(rangeChanged(ms))}
          />
        )}
      >
        {/* Two planes, two windows. The strip states its own; the panel states the feed's. */}
        <TopicLiveStrip
          live={live}
          traffic={traffic}
          now={now}
          onShowFailingFlows={() => dispatch(pivotedToFailingFlows(topic))}
        />
        {/* The window as DATES when the feed states them. "Over the usage feed's own window" is
            true and unfalsifiable, and a reader who cannot bound the period cannot quote the
            number — one derived it from a call rate and was out by a factor of twelve. */}
        <UsagePanel
          traffic={traffic}
          entries={usageRows}
          windowLabel={usageWindow
            ? (
              <>
                between <Stamp iso={usageWindow.from} now={now} />
                {' and '}
                {/* The END carries the age, because that is the staleness of the whole figure: a
                    window that closed five weeks ago makes every count beside it historical. */}
                <Stamp iso={usageWindow.to} now={now} />
              </>
            )
            : "over the usage feed's own window, which the feed does not state"}
          version={entry.version}
        />

        {/* AN EXCLUSION, STATED: no charts, no series. Asked for repeatedly, and refused for a
            reason — the mesh holds counts over a window and ages, not time series, and drawing a
            trend line over data it does not have would be the most convincing lie it could tell. */}
        <Keyline>
          Counts over a window and ages, not a time series — history and trends belong to your
          metrics product.
        </Keyline>

        {flows.available && (
          <>
            <h4>Flows</h4>
          {/* The trace summaries carry a topic and no version, so these flows are the WHOLE topic's
              — which on a version-scoped page put a red "1 failing of 1" on the version that is
              clean, sourced from the failure on the version that is not. The panel cannot be
              filtered because the data to filter on does not exist; saying so is the honest option,
              and it is the same admission the traffic panel already makes one section up. */}
          {versionLabel(entry.version) && (
            <p className="bz-page-note">
              These are flows for the whole of {topic}. The trace feed does not record a payload
              version, so none of them is attributed to {versionLabel(entry.version)}.
            </p>
          )}
            <FlowList
              view={flows}
              failingOnly={failingOnly}
              subject={topic}
              onToggleFailing={() => dispatch(failingFlowsToggled())}
              onOpenService={openService}
            />
          </>
        )}
      </Card>

      <Card title="Contract" note="The payload this topic carries, with any drift marked on the field itself">
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
      </Card>


    </div>
  );
}
