import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectVisibleServices, ragForStatus, selectVisibleServiceLinks } from '../../store/selectors';
import { serviceToggled, navigated } from '../../store/slices/viewSlice';
import { ServiceCard } from '../controls/ServiceCard';
import { ServiceLinks } from '../controls/ServiceLinks';
import { EmptyState } from '../primitives/EmptyState';

/**
 * The one place components meet the store.
 *
 * Containers read with selectors and write with dispatch; everything below them is a pure component
 * taking props. Keeping that boundary in a handful of containers is what makes the rest of the
 * library reusable — a team assembling their own mesh UI takes the components and supplies their own
 * containers, or reuses ours.
 */
export interface ServiceListProps {
  /**
   * This page's own URL, for the "back to Mesh" link the spec view builds and as the base every
   * self-reported URL is resolved against. Passed in rather than read from `window`, so the list
   * renders identically in a test and in Storybook.
   */
  pageUrl?: string;
}

export function ServiceList({ pageUrl = '' }: ServiceListProps = {}) {
  const services = useAppSelector(selectVisibleServices);
  const expanded = useAppSelector((s) => s.view.expandedServices);
  const links = useAppSelector((s) => selectVisibleServiceLinks(s, pageUrl));
  const dispatch = useAppDispatch();

  if (services.length === 0) {
    return <EmptyState message="No services match this filter." />;
  }

  return (
    <div className="bz-svc-list">
      {services.map((service, i) => (
        <ServiceCard
          key={service.name}
          service={service}
          rag={ragForStatus(service.status)}
          links={<ServiceLinks {...links[i]!} />}
          expanded={expanded.includes(service.name)}
          onToggle={(name) => dispatch(serviceToggled(name))}
          onOpen={(name) => dispatch(navigated({ page: 'service', selected: name }))}
        />
      ))}
    </div>
  );
}
