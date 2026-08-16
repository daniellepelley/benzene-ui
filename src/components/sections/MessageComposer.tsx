import type { ComposeResult, SendState } from '../../store/slices/composeSlice';
import type { TopicsTopicsItem } from '../../contracts';
import { versionLabel } from '../../store/selectors';
import { EmptyState } from '../primitives/EmptyState';
import { Badge } from '../primitives/Badge';

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
  /** The required "I understand this runs the real handler" acknowledgement — see `canSend`. */
  confirmed: boolean;
  onVersion: (index: number) => void;
  onTransport: (transport: string) => void;
  onBody: (json: string) => void;
  onHeaders: (json: string) => void;
  onConfirmToggle: () => void;
  /** Absent on a read-only mesh — the composer then explains itself rather than disappearing. */
  onSend?: () => void;
}

/**
 * Compose a message against a topic and send it — the mesh equivalent of "try it out".
 *
 * Every field is a prop and every keystroke a callback: the draft, the selected version and the
 * result all live in the store, so switching away and back keeps the message intact.
 */
export function MessageComposer({
  versions, versionIndex, transports, transport, headersJson, bodyJson,
  bodyValid, headersValid, canSend, send, error, result, confirmed,
  onVersion, onTransport, onBody, onHeaders, onConfirmToggle, onSend,
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
          This mesh has no invoke endpoint configured, so messages can be composed but not sent.
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
            Response <Badge rag={isOk(result.statusCode) ? 'green' : 'red'}>{result.statusCode}</Badge>
          </h4>
          <pre>{pretty(result.body)}</pre>
        </section>
      )}
    </div>
  );
}

const isOk = (status: string) =>
  ['ok', 'created', 'accepted', 'updated', 'deleted', 'ignored'].includes(status);

/** Pretty-print if it parses, otherwise show it verbatim — a non-JSON body is still worth reading. */
function pretty(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
