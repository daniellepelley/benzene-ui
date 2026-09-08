import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectSetup, type SetupItem, type SetupState, type ServiceSetupRow } from '../../store/setup';
import { selectNow, ragForStatus } from '../../store/selectors';
import type { Liveness } from '../../store/selectors';
import { navigated } from '../../store/slices/viewSlice';
import { PageHead } from '../controls/PageHead';
import { Badge } from '../primitives/Badge';
import { Stamp } from '../primitives/Stamp';
import { EmptyState } from '../primitives/EmptyState';
import type { Rag } from '../../contracts';

/**
 * The one page about the mesh itself rather than about the estate.
 *
 * Every other screen renders what it can stand behind and nothing else. This is where the reasons
 * live: which feeds are wired, which are not, which are failing, and — per service — which of the
 * mesh's feeds each service is actually supplying. A mesh works on the subset it has, and this page
 * is the subset made visible: not-wired is listed as the ordinary shape of a partial deployment,
 * and only the things that need a person (failing, degraded) are counted into the nav badge that
 * brought the reader here.
 */
export function SetupPage() {
  const dispatch = useAppDispatch();
  const setup = useAppSelector(selectSetup);
  const now = useAppSelector(selectNow);
  const generatedAtUtc = useAppSelector((s) => s.estate.generatedAtUtc);
  const live = setup.items.find((i) => i.id === 'live')?.state === 'ready'
    || setup.items.find((i) => i.id === 'live')?.state === 'degraded';

  const openService = (name: string) => dispatch(navigated({ page: 'service', selected: name }));

  return (
    <div className="bz-page bz-setup">
      <PageHead
        breadcrumb={[{ label: 'Estate', onClick: () => dispatch(navigated({ page: 'fleet' })) }]}
        title={'Setup'}
        lede="What this mesh has wired, what it has not, and what is failing. A mesh works on the subset it has — an item that is not wired is a smaller mesh, not a broken one; only the rows that need a person are counted in the nav."
        badges={setup.attention > 0 ? (
          <Badge rag={setup.worst === 'failing' ? 'red' : 'amber'}>
            {setup.attention} need{setup.attention === 1 ? 's' : ''} attention
          </Badge>
        ) : (
          <Badge rag="green">nothing needs attention</Badge>
        )}
        actions={(
          <span className="bz-page-note">
            <Stamp iso={generatedAtUtc} now={now} label="catalog published" absent="no catalog published yet" />
          </span>
        )}
      />

      <section>
        <h2>This mesh</h2>
        <ul className="bz-setup-items">
          {setup.items.map((item) => <SetupRow key={item.id} item={item} />)}
        </ul>
      </section>

      <section>
        <div className="bz-section-head">
          <h2>Services</h2>
          <span className="bz-page-note">which of the mesh’s feeds each service is supplying</span>
        </div>
        {setup.services.length === 0 ? (
          <EmptyState message="No services are catalogued yet." tone="unknown" />
        ) : (
          <div className="bz-table-wrap">
            <table className="bz-table bz-setup-services">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Reachable</th>
                  <th>Declares topics</th>
                  <th>Reporting</th>
                  <th>Usage</th>
                  <th>What to do</th>
                </tr>
              </thead>
              <tbody>
                {setup.services.map((row) => (
                  <ServiceSetupLine key={row.name} row={row} live={live} onOpen={openService} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="bz-setup-legend">
          <span data-mark="yes">✓</span> supplying
          <span data-mark="no">✗</span> not supplying
          <span data-mark="off">—</span> the mesh has no feed to supply it to
          <span data-mark="unknown">?</span> the feed could not be read
        </p>
        {setup.undeclared.length > 0 && (
          <p className="bz-page-note">
            Reporting to the collector but absent from the catalog:{' '}
            {setup.undeclared.map((name, i) => (
              <span key={name}>
                {i > 0 && ', '}
                <button type="button" className="bz-link" onClick={() => openService(name)}>{name}</button>
              </span>
            ))}
            . The aggregator never fetched a spec for {setup.undeclared.length === 1 ? 'it' : 'them'} — check its
            discovery source lists {setup.undeclared.length === 1 ? 'it' : 'them'}.
          </p>
        )}
      </section>
    </div>
  );
}

const STATE_RAG: Record<SetupState, Rag | undefined> = {
  ready: 'green',
  degraded: 'amber',
  failing: 'red',
  off: 'gone',
  pending: undefined,
};

const STATE_WORD: Record<SetupState, string> = {
  ready: 'ready',
  degraded: 'degraded',
  failing: 'failing',
  off: 'not wired',
  pending: 'pending',
};

function SetupRow({ item }: { item: SetupItem }) {
  return (
    <li className="bz-setup-item" data-state={item.state}>
      <div className="bz-setup-item-head">
        <Badge rag={STATE_RAG[item.state]}>{STATE_WORD[item.state]}</Badge>
        <h3>{item.label}</h3>
        <span className="bz-setup-detail">{item.detail}</span>
      </div>
      <dl className="bz-setup-item-body">
        <dt>Unlocks</dt>
        <dd>{item.unlocks}</dd>
        {item.state !== 'ready' && (
          <>
            <dt>{item.state === 'failing' || item.state === 'degraded' ? 'Wiring' : 'To wire it'}</dt>
            <dd>{item.howTo}</dd>
          </>
        )}
      </dl>
    </li>
  );
}

type Mark = 'yes' | 'no' | 'off' | 'unknown';

function Cell({ mark, title }: { mark: Mark; title: string }) {
  const glyph: Record<Mark, string> = { yes: '✓', no: '✗', off: '—', unknown: '?' };
  // An accessible name, not a tooltip: the legend under the table says what each mark means.
  return <span className="bz-setup-mark" data-mark={mark} role="img" aria-label={title}>{glyph[mark]}</span>;
}

const UNREADABLE = 'The topics feed could not be read';
const NO_LIVE_PLANE = 'No live plane is wired, so nothing observes reporting';
const NO_USAGE_FEED = 'No usage feed is wired';

const LIVE_TITLE: Record<Liveness, string> = {
  live: 'Heartbeat received recently',
  stale: 'Was reporting, then went quiet',
  silent: 'Never reported — mesh reporting is probably not wired in this service',
};

function ServiceSetupLine({ row, live, onOpen }: { row: ServiceSetupRow; live: boolean; onOpen: (name: string) => void }) {
  return (
    <tr>
      <td>
        <button type="button" className="bz-link bz-setup-service" onClick={() => onOpen(row.name)}>{row.name}</button>
      </td>
      <td><Badge rag={ragForStatus(row.status)}>{row.status}</Badge></td>
      <td>
        <Cell
          mark={row.reachable ? 'yes' : 'no'}
          title={row.reachable ? 'The aggregator reached it' : 'The aggregator could not reach it'}
        />
      </td>
      {/* The marks carry an accessible label only; the legend below the table and the "What to do"
          column are where the words live, so nothing here is hover-only. */}
      <td>
        {row.declares == null
          ? <Cell mark="unknown" title={UNREADABLE} />
          : <Cell mark={row.declares ? 'yes' : 'no'} title={row.declares ? 'Its contract declares topics' : 'Its contract declares no topics'} />}
      </td>
      <td>
        {!live || row.live == null
          ? <Cell mark="off" title={NO_LIVE_PLANE} />
          : <Cell mark={row.live === 'silent' ? 'no' : 'yes'} title={LIVE_TITLE[row.live]} />}
        {row.live === 'stale' && <span className="bz-setup-qualifier">stale</span>}
        {row.missingFeeds.length > 0 && (
          <span className="bz-setup-qualifier">
            no {row.missingFeeds.join(', ')}
          </span>
        )}
      </td>
      <td>
        {row.usage == null
          ? <Cell mark="off" title={NO_USAGE_FEED} />
          : <Cell mark={row.usage ? 'yes' : 'no'} title={row.usage ? 'The usage feed attributes traffic to it' : 'The usage feed has no rows for it'} />}
      </td>
      <td className="bz-setup-hints" data-wrap="">
        {row.hints.length === 0 ? <span className="bz-muted">—</span> : row.hints.map((h) => <p key={h}>{h}</p>)}
      </td>
    </tr>
  );
}
