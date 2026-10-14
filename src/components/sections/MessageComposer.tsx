import { composeOutcomeOf, type ComposeOutcome, type ComposeResult, type SendState } from '../../store/slices/composeSlice';
import type { Rag } from '../../contracts';
import type { TopicsTopicsItem } from '../../contracts';
import { versionLabel } from '../../store/selectors';
import { EmptyState } from '../primitives/EmptyState';
import { Badge } from '../primitives/Badge';
import type { ComposeProblem } from '../../store/selectors';

export interface MessageComposerProps {
  versions: TopicsTopicsItem[];
  versionIndex: number;
  transports: string[];
  transport: string;
  headersJson: string;
  bodyJson: string;
  bodyValid: boolean;
  headersValid: boolean;
  canSend: boolean;
  send: SendState;
  error: string | null;
  result: ComposeResult | null;
  /**
   * The failed result's problem document, laid out (`selectComposeProblem`): its errors with
   * `field` and `code` intact. Null when the result did not fail or carries no problem document.
   */
  problem?: ComposeProblem | null;
  /** The required "I understand this runs the real handler" acknowledgement — see `canSend`. */
  confirmed: boolean;
  onVersion: (index: number) => void;
  onTransport: (transport: string) => void;
  onBody: (json: string) => void;
  onHeaders: (json: string) => void;
  onConfirmToggle: () => void;
  /** Absent on a read-only mesh — the composer then explains itself rather than disappearing. */
  onSend?: () => void;
  /** Where a read-only composer sends the reader to learn what wiring a send needs. */
  onSetup?: () => void;
}

/**
 * Compose a message against a topic and send it — the mesh equivalent of "try it out".
 *
 * Every field is a prop and every keystroke a callback: the draft, the selected version and the
 * result all live in the store, so switching away and back keeps the message intact.
 */
export function MessageComposer({
  versions, versionIndex, transports, transport, headersJson, bodyJson,
  bodyValid, headersValid, canSend, send, error, result, problem, confirmed,
  onVersion, onTransport, onBody, onHeaders, onConfirmToggle, onSend, onSetup,
}: MessageComposerProps) {
  if (versions.length === 0) {
    return <EmptyState message="This topic has no non-reserved version to compose against." />;
  }

  return (
    <div className="bz-compose">
      <div className="bz-compose-controls">
        <label>
          Payload
          <select value={versionIndex} onChange={(e) => onVersion(Number(e.target.value))}>
            {versions.map((v, i) => (
              <option key={v.version || 'default'} value={i}>
                {/* versionLabel, not `v${...}` — the catalogue's versions are already "v1"/"v2", so
                    prefixing produced "vv1" on the one control whose job is to say which contract
                    you are about to send. */}
                {versionLabel(v.version) || 'default'}
                {/* Saying "no schema" is why the empty skeleton below is empty. */}
                {v.messageSchema || v.requestSchema ? '' : ' (no schema)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Transport
          <select value={transport} onChange={(e) => onTransport(e.target.value)}>
            {transports.map((t) => (
              <option key={t} value={t}>
                {t === 'raw' ? 'raw (benzene-message)' : t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="bz-compose-field">
        Headers
        <textarea rows={3} value={headersJson} onChange={(e) => onHeaders(e.target.value)} aria-invalid={!headersValid} />
        {!headersValid && <span className="bz-compose-invalid">Headers are not valid JSON.</span>}
      </label>

      <label className="bz-compose-field">
        Body
        <textarea rows={12} value={bodyJson} onChange={(e) => onBody(e.target.value)} aria-invalid={!bodyValid} />
        {!bodyValid && <span className="bz-compose-invalid">Body is not valid JSON.</span>}
      </label>

      {onSend ? (
        <div className="bz-composer-send">
          <label className="bz-composer-confirm">
            <input type="checkbox" checked={confirmed} onChange={onConfirmToggle} />
            This sends a real message to the service's real handler — it is not a dry run.
          </label>
          <button type="button" disabled={!canSend} onClick={onSend}>
            {send === 'sending' ? 'Sending…' : 'Send'}
          </button>
          {/* Send is disabled for two completely different reasons and only one of them said so.
              Editing the body deliberately clears the confirmation — the reader is confirming a
              specific payload, not confirming in general — but doing it silently taught people that
              a greyed-out Send means bad JSON, then greyed it out when the JSON was fine. */}
          {!canSend && bodyValid && headersValid && !confirmed && send !== 'sending' && (
            <span className="bz-compose-invalid">
              Tick the box above to send. Editing the message clears it, because the confirmation is
              for the payload you are about to send.
            </span>
          )}
        </div>
      ) : (
        <p className="bz-composer-readonly">
          Dispatch is not wired on this mesh, so messages can be composed but not sent.
          {onSetup && (
            <>
              {' '}
              <button type="button" className="bz-link" onClick={onSetup}>See Setup</button>
            </>
          )}
        </p>
      )}

      {/* A blocked dispatch is a safety gate working as intended (most often MeshDispatchGate's
          Production check), not a failure to explain away — it gets its own tone and its own words
          rather than folding into the same red box a genuine send failure gets. */}
      {send === 'blocked' && (
        <p className="bz-composer-blocked">
          <strong>Blocked:</strong> {error}
        </p>
      )}
      {send === 'failed' && error && <p className="bz-composer-error">{error}</p>}

      {result && (
        <section className="bz-compose-result">
          <h4>
            Response{' '}
            <Badge rag={OUTCOME_RAG[composeOutcomeOf(result)]}>
              {result.httpStatus != null ? `HTTP ${result.httpStatus}` : result.statusCode || 'no status'}
            </Badge>
          </h4>
          {/* Said in the visible plane, not a hover: whether this response is evidence of success is
              the one thing this screen exists to establish. */}
          {result.httpStatus != null ? (
            <p className="bz-compose-note">
              The target answered HTTP {result.httpStatus} without a Benzene envelope, so this is its
              carrier's status, not a handler's result.
            </p>
          ) : composeOutcomeOf(result) === 'unclassified' && (
            <p className="bz-compose-note">
              The response did not say whether it succeeded (it carried no <code>isSuccessful</code>),
              and this console does not guess from the status text.
            </p>
          )}
          {problem && (
            <div className="bz-compose-problem">
              {problem.detail && <p className="bz-compose-problem-detail">{problem.detail}</p>}
              {/* Field, code and message are the evidence a validation sign-off needs; the raw
                  document stays below for anything this table leaves out. */}
              {problem.rows.length > 0 && (
                <table className="bz-table bz-compose-errors">
                  <thead>
                    <tr><th>Field</th><th>Code</th><th>Message</th><th>You sent</th></tr>
                  </thead>
                  <tbody>
                    {problem.rows.map((row, i) => (
                      <tr key={i}>
                        <td>{row.field ? <code>{row.field}</code> : <span className="bz-muted">whole request</span>}</td>
                        <td>{row.code ? <code>{row.code}</code> : <span className="bz-muted">—</span>}</td>
                        <td>{row.message}</td>
                        <td>
                          {row.sent === undefined ? <span className="bz-muted">—</span>
                            : row.sent === 'absent' ? <em>not in the body</em>
                            : <code>{row.sent}</code>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          <pre>{pretty(result.body)}</pre>
        </section>
      )}
    </div>
  );
}

/**
 * Green and red come from the response's own `isSuccessful` and from nothing else (wire-contracts
 * §1.2): an application-defined status means nothing to a list of known words, and a known word
 * on a result that says it failed is a failure. No signal is amber — a reason to look, not to relax.
 */
const OUTCOME_RAG: Record<ComposeOutcome, Rag> = { succeeded: 'green', failed: 'red', unclassified: 'amber' };

/** Pretty-print if it parses, otherwise show it verbatim — a non-JSON body is still worth reading. */
function pretty(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
