import type { AgreementNode, AgreementPlane, SchemaAgreementView } from '../../store/selectors';
import { EmptyState } from '../primitives/EmptyState';
import { Keyline } from '../primitives/Keyline';

export interface SchemaAgreementProps {
  view: SchemaAgreementView;
}

const PLANE_LABEL: Record<AgreementPlane['plane'], string> = {
  request: 'Request',
  response: 'Response',
  message: 'Message',
};

/**
 * Where the services on one topic disagree about its payload — one merged tree, disagreement marked
 * on the field.
 *
 * ONE TREE, NOT N. Rendering each service's schema side by side makes the reader diff columns by
 * eye, which is exactly the work this screen exists to remove, and it stops fitting at three
 * services. A field/service matrix scales the other way but flattens nesting into dotted paths and
 * introduces a third way of drawing a schema into a product that has standardised on one. The union
 * costs ink only where there is disagreement: a field everyone declares identically renders as an
 * ordinary row and says nothing.
 *
 * SYMMETRIC, ALWAYS. Every marker is `differs`, every absence is `not declared — <service>`. Never
 * "missing", never "extra", and no variant is ordered or styled as the reference — because either
 * declaration could be the correct one, and deciding which is the reader's judgement, not the
 * product's. That rule is what makes this a finding rather than an accusation.
 */
export function SchemaAgreement({ view }: SchemaAgreementProps) {
  if (!view.published) {
    return (
      <EmptyState
        tone="unknown"
        message="These services do not declare the same shape. This catalogue does not publish what each service declared, so which fields differ is not shown here — compare each service's own spec."
      />
    );
  }

  return (
    <div className="bz-agreement">
      {view.planes.map((plane) => (
        <section key={plane.plane} className="bz-agreement-plane">
          <h4>{PLANE_LABEL[plane.plane]}</h4>
          <p className="bz-agreement-head">
            declared by {plane.declaredBy.length}{' '}
            {plane.declaredBy.length === 1 ? 'service' : 'services'}
            {plane.differCount > 0 && (
              <> · <strong>{plane.differCount}</strong>{' '}
                {plane.differCount === 1 ? 'field differs' : 'fields differ'}
              </>
            )}
          </p>

          {/* A whole plane one service never declared. A root-level fact, never a silent drop. */}
          {plane.absent.length > 0 && (
            <p className="bz-agreement-absent">
              no {plane.plane} schema declared — {plane.absent.join(', ')}
            </p>
          )}

          <ul className="bz-agreement-tree">
            {plane.root.map((node) => <AgreementRow key={node.name} node={node} />)}
          </ul>
        </section>
      ))}

      <Keyline>
        Each line is what a service <strong>declared</strong>, not a judgement about it —
        <strong> differs</strong> says the declarations are not the same, and says nothing about which
        one is right. Whether the fix is to add a field, drop one, rename, or version the topic is
        yours to decide.
      </Keyline>
    </div>
  );
}

function AgreementRow({ node }: { node: AgreementNode }) {
  return (
    <li className="bz-agreement-node" data-agrees={node.agrees ? 'true' : 'false'}>
      <div className="bz-schema-row">
        <span className="bz-schema-name">
          {node.name}
          {node.consensus?.required && <abbr className="bz-schema-req" title="Required">*</abbr>}
        </span>

        {node.agrees && node.consensus ? (
          <>
            <span className="bz-schema-type">{node.consensus.type}</span>
            {node.consensus.facets.length > 0 && (
              <span className="bz-schema-facets">{node.consensus.facets.join(' · ')}</span>
            )}
          </>
        ) : (
          <span className="bz-agreement-mark" data-kind="differs">differs</span>
        )}

        {/* The roll-up: this field agrees, but something under it does not. Without it, a reader
            scanning a collapsed-looking object has no reason to look inside. */}
        {node.agrees && node.differsInside && (
          <span className="bz-agreement-mark" data-kind="inside">differs inside</span>
        )}
      </div>

      {node.consensus?.description && (
        <p className="bz-schema-desc">{node.consensus.description}</p>
      )}

      {/* ONE LINE PER DISTINCT DECLARATION. Presence, type and requiredness conflicts all read the
          same way, so there is one treatment doing one job rather than three that must be learned. */}
      {node.variants && (
        <ul className="bz-agreement-variants">
          {node.variants.map((variant) => (
            <li key={variant.label} data-absent={variant.label === 'not declared' ? 'true' : undefined}>
              <span className="bz-agreement-what">{variant.label}</span>
              <span className="bz-agreement-who">{variant.services.join(', ')}</span>
            </li>
          ))}
        </ul>
      )}

      {node.truncated && (
        <p className="bz-schema-truncated">
          nothing beneath was compared, because the declared types differ
        </p>
      )}

      {node.children.length > 0 && (
        <ul className="bz-agreement-tree">
          {node.children.map((child) => <AgreementRow key={child.name} node={child} />)}
        </ul>
      )}
    </li>
  );
}
